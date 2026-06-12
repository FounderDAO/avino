import { TelegramService } from './telegram.service';

function makeService(overrides: {
  config?: Record<string, unknown>;
  storedEnabled?: string | null;
}) {
  const cfg: Record<string, unknown> = {
    'app.env': 'development',
    'telegram.notificationStateDefault': true,
    'telegram.botToken': 'TOK',
    'telegram.adminChatId': '123',
    ...(overrides.config ?? {}),
  };
  const config = { get: (k: string) => cfg[k] };
  const prisma = {
    appSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.storedEnabled === undefined
            ? null
            : { value: overrides.storedEnabled },
        ),
    },
  };
  return new TelegramService(config as never, prisma as never);
}

describe('TelegramService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('isEnabled: DB "false" overrides env default true', async () => {
    const s = makeService({ storedEnabled: 'false' });
    expect(await s.isEnabled()).toBe(false);
  });

  it('isEnabled: env default used when no DB row', async () => {
    const s = makeService({
      storedEnabled: undefined,
      config: { 'telegram.notificationStateDefault': false },
    });
    expect(await s.isEnabled()).toBe(false);
  });

  it('sendAdminAlert: no-op (no fetch) when disabled', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const s = makeService({ storedEnabled: 'false' });
    await s.sendAdminAlert('hi');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sendAdminAlert: no fetch when creds missing (dev log)', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const s = makeService({ config: { 'telegram.botToken': undefined } });
    await s.sendAdminAlert('hi');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sendAdminAlert: calls Bot API when enabled+configured', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as never;
    const s = makeService({ storedEnabled: 'true' });
    await s.sendAdminAlert('hello');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/botTOK/sendMessage');
    expect(JSON.parse(init.body)).toMatchObject({
      chat_id: '123',
      text: 'hello',
    });
  });

  it('sendAdminAlert: never throws when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as never;
    const s = makeService({ storedEnabled: 'true' });
    await expect(s.sendAdminAlert('x')).resolves.toBeUndefined();
  });
});
