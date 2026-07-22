import { SmsService } from './sms.service';

/**
 * Юнит-тесты SmsService (TASK-041 hardening). Провайдер изолирован через мок
 * `global.fetch`; конфиг — через лёгкий стаб ConfigService (как telegram.spec).
 */
function makeService(
  overrides: Record<string, unknown> = {},
  storedSmsEnabled?: string | null,
) {
  const cfg: Record<string, unknown> = {
    'app.env': 'development',
    'sms.eskizEmail': 'bot@avino.uz',
    'sms.eskizPassword': 'secret',
    'sms.eskizBaseUrl': 'https://notify.eskiz.uz/api',
    'sms.eskizFrom': '4546',
    'sms.enabled': true,
    ...overrides,
  };
  const config = { get: (k: string) => cfg[k] };
  const prisma = {
    appSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          storedSmsEnabled === undefined ? null : { value: storedSmsEnabled },
        ),
    },
  };
  return new SmsService(config as never, prisma as never);
}

/** Ответ-стаб в форме, достаточной для SmsService (ok/status/json). */
function res(
  status: number,
  body: unknown,
  statusText = '',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  } as unknown as Response;
}

const AUTH_OK = () => res(200, { data: { token: 'TKN' } });
const SEND_OK = () =>
  res(200, { id: 'msg-1', status: 'waiting', message: 'Waiting for SMS provider' });

describe('SmsService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('dev-fallback: no creds → no fetch, no throw', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const s = makeService({ 'sms.eskizEmail': undefined });
    await expect(s.send('+998901234567', 'hi')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('prod + no creds: no fetch, no throw (warns instead)', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const s = makeService({
      'sms.eskizPassword': undefined,
      'app.env': 'production',
    });
    await expect(s.send('+998901234567', 'hi')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('happy path: logs in then sends with normalized phone + from', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce(AUTH_OK())
      .mockResolvedValueOnce(SEND_OK());
    global.fetch = fetchSpy as never;

    const s = makeService();
    await s.send('+998901234567', 'hello');

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [loginUrl, loginInit] = fetchSpy.mock.calls[0];
    expect(loginUrl).toBe('https://notify.eskiz.uz/api/auth/login');
    expect((loginInit.body as URLSearchParams).get('email')).toBe('bot@avino.uz');
    expect((loginInit.body as URLSearchParams).get('password')).toBe('secret');

    const [sendUrl, sendInit] = fetchSpy.mock.calls[1];
    expect(sendUrl).toBe('https://notify.eskiz.uz/api/message/sms/send');
    expect(sendInit.headers.Authorization).toBe('Bearer TKN');
    const sendBody = sendInit.body as URLSearchParams;
    // Eskiz ждёт номер без ведущего «+».
    expect(sendBody.get('mobile_phone')).toBe('998901234567');
    expect(sendBody.get('message')).toBe('hello');
    expect(sendBody.get('from')).toBe('4546');
  });

  it('token cache: second send reuses token (single login)', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce(AUTH_OK())
      .mockResolvedValueOnce(SEND_OK())
      .mockResolvedValueOnce(SEND_OK());
    global.fetch = fetchSpy as never;

    const s = makeService();
    await s.send('+998901111111', 'a');
    await s.send('+998902222222', 'b');

    expect(fetchSpy).toHaveBeenCalledTimes(3); // login + 2 sends
    expect(fetchSpy.mock.calls[0][0]).toContain('/auth/login');
    expect(fetchSpy.mock.calls[1][0]).toContain('/message/sms/send');
    expect(fetchSpy.mock.calls[2][0]).toContain('/message/sms/send');
  });

  it('proactively relogins when cached token exceeds TTL (no 401 needed)', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce(AUTH_OK()) // login @ t=0
      .mockResolvedValueOnce(SEND_OK()) // send #1
      .mockResolvedValueOnce(AUTH_OK()) // proactive relogin after TTL
      .mockResolvedValueOnce(SEND_OK()); // send #2
    global.fetch = fetchSpy as never;

    const s = makeService();
    await s.send('+998901111111', 'a');
    // 26 дней спустя — за пределами TTL-запаса.
    nowSpy.mockReturnValue(26 * 24 * 60 * 60 * 1000);
    await s.send('+998902222222', 'b');

    expect(fetchSpy).toHaveBeenCalledTimes(4); // login + send + relogin + send
    expect(fetchSpy.mock.calls[2][0]).toContain('/auth/login');
  });

  it('401 on send → relogin and retry once (success)', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce(AUTH_OK()) // login #1
      .mockResolvedValueOnce(res(401, {})) // send → token expired
      .mockResolvedValueOnce(AUTH_OK()) // relogin #2
      .mockResolvedValueOnce(SEND_OK()); // send retry ok
    global.fetch = fetchSpy as never;

    const s = makeService();
    await expect(s.send('+998901234567', 'hi')).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('401 twice → throws delivery failed', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce(AUTH_OK())
      .mockResolvedValueOnce(res(401, {}))
      .mockResolvedValueOnce(AUTH_OK())
      .mockResolvedValueOnce(res(401, {}));
    global.fetch = fetchSpy as never;

    const s = makeService();
    await expect(s.send('+998901234567', 'hi')).rejects.toThrow(
      'Eskiz SMS delivery failed',
    );
  });

  it('auth login failure → throws with status', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(res(500, {})) as never;
    const s = makeService();
    await expect(s.send('+998901234567', 'hi')).rejects.toThrow(
      'Eskiz auth failed: 500',
    );
  });

  it('auth returns no token → throws', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(res(200, { data: {} })) as never;
    const s = makeService();
    await expect(s.send('+998901234567', 'hi')).rejects.toThrow(
      'Eskiz auth returned no token',
    );
  });

  it('non-401 send error surfaces Eskiz reason (template moderation)', async () => {
    const reason = 'Текст сообщения не соответствует ни одному шаблону';
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce(AUTH_OK())
      .mockResolvedValueOnce(res(400, { status: 'error', message: reason }, 'Bad Request'));
    global.fetch = fetchSpy as never;

    const s = makeService();
    await expect(s.send('+998901234567', 'hi')).rejects.toThrow(reason);
    // Не должно быть ретрая: не-401 — это не протухший токен.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('sendOtp: builds the OTP message text and sends it', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce(AUTH_OK())
      .mockResolvedValueOnce(SEND_OK());
    global.fetch = fetchSpy as never;

    const s = makeService();
    await s.sendOtp('+998901234567', '123456');

    const sendBody = fetchSpy.mock.calls[1][1].body as URLSearchParams;
    expect(sendBody.get('message')).toBe(
      'Avino platformasiga kirish uchun tasdiqlash kodi: 123456. Kodni hech kimga bermang.',
    );
  });

  describe('isEnabled (admin toggle)', () => {
    it('DB "false" overrides env default true', async () => {
      const s = makeService({ 'sms.enabled': true }, 'false');
      expect(await s.isEnabled()).toBe(false);
    });

    it('DB "true" overrides env default false', async () => {
      const s = makeService({ 'sms.enabled': false }, 'true');
      expect(await s.isEnabled()).toBe(true);
    });

    it('env default used when no DB row', async () => {
      const s = makeService({ 'sms.enabled': false }, undefined);
      expect(await s.isEnabled()).toBe(false);
    });

    it('DB error → falls back to env default', async () => {
      const config = {
        get: (k: string) => (k === 'sms.enabled' ? true : undefined),
      };
      const prisma = {
        appSetting: {
          findUnique: jest.fn().mockRejectedValue(new Error('db down')),
        },
      };
      const s = new SmsService(config as never, prisma as never);
      expect(await s.isEnabled()).toBe(true);
    });
  });
});
