import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { MeResponse } from './dto/me-response.dto';
import { RefreshResult, VerifyOtpResult } from './auth.service';

/**
 * Юнит-тесты `AuthController`. Контроллер — тонкая обёртка над сервисами; здесь
 * проверяется делегирование и поведение httpOnly refresh-cookie (ADR-0153,
 * TASK-256): логин/ротация ставят `avino_rt`, тело ответа сохраняет
 * `refresh_token` (mobile), refresh/logout читают токен из cookie ИЛИ тела.
 */

/** Значения authCookie.* из конфига (secure prod-профиль). */
const configMock = {
  get: (key: string): unknown =>
    ({
      'authCookie.secure': true,
      'authCookie.domain': '.avino.uz',
      'authCookie.maxAgeSec': 2592000,
    })[key],
} as any;

/** Ожидаемые опции cookie при configMock. */
const EXPECTED_COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  domain: '.avino.uz',
  path: '/api/v1/auth',
  maxAge: 2592000 * 1000,
};

/** Фейковый Express-Response с cookie/clearCookie-шпионами. */
const makeRes = () =>
  ({ cookie: jest.fn(), clearCookie: jest.fn() }) as any;

const SESSION: VerifyOtpResult = {
  access_token: 'access',
  refresh_token: 'refresh',
  token_type: 'Bearer',
  expires_in: 900,
  user: {
    id: 'u1',
    phone: '+998901234567',
    email: null,
    default_language: 'RU',
    status: 'ACTIVE',
    roles: ['USER'],
    is_phone_verified: true,
    is_email_verified: false,
  },
};

describe('AuthController.me', () => {
  it('delegates to AuthService.getMe with the current user id and returns the contract', async () => {
    const me: MeResponse = {
      id: 'u1',
      phone: '+998901234567',
      email: null,
      status: 'ACTIVE',
      default_language: 'RU',
      is_phone_verified: true,
      is_email_verified: false,
      roles: ['USER'],
      profile: {
        first_name: 'Ali',
        last_name: null,
        display_name: null,
        avatar_url: null,
        contact_phone: null,
        contact_phone_verified: false,
        preferred_language: 'RU',
      },
      legal_consent: { accepted_version: null, accepted_at: null },
    };
    const authService = { getMe: jest.fn().mockResolvedValue(me) };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );

    await expect(controller.me('u1')).resolves.toBe(me);
    expect(authService.getMe).toHaveBeenCalledWith('u1');
  });
});

describe('AuthController.verifyOtp', () => {
  it('delegates to AuthService.verifyOtp and sets the avino_rt refresh cookie', async () => {
    const authService = { verifyOtp: jest.fn().mockResolvedValue(SESSION) };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );
    const res = makeRes();

    const out = await controller.verifyOtp(
      { channel: 'SMS', destination: '+998901234567', code: '123456' } as any,
      res,
      '1.1.1.1',
      'UA',
    );

    expect(out).toBe(SESSION);
    // Тело ответа по-прежнему несёт refresh_token (mobile-контракт не сломан).
    expect(out.refresh_token).toBe('refresh');
    expect(res.cookie).toHaveBeenCalledWith(
      'avino_rt',
      'refresh',
      EXPECTED_COOKIE_OPTS,
    );
  });
});

describe('AuthController.google', () => {
  it('delegates to GoogleAuthService.login and sets the refresh cookie', async () => {
    const googleAuthService = { login: jest.fn().mockResolvedValue(SESSION) };
    const controller = new AuthController(
      {} as any,
      {} as any,
      googleAuthService as any,
      {} as any,
      configMock,
    );
    const res = makeRes();

    const out = await controller.google(
      { id_token: 't' } as any,
      res,
      '1.1.1.1',
      'UA',
    );
    expect(googleAuthService.login).toHaveBeenCalledWith(
      { id_token: 't' },
      '1.1.1.1',
      'UA',
    );
    expect(out).toBe(SESSION);
    expect(res.cookie).toHaveBeenCalledWith(
      'avino_rt',
      'refresh',
      EXPECTED_COOKIE_OPTS,
    );
  });
});

describe('AuthController.apple', () => {
  it('delegates to AppleAuthService.login and sets the refresh cookie', async () => {
    const appleAuthService = { login: jest.fn().mockResolvedValue(SESSION) };
    const controller = new AuthController(
      {} as any,
      {} as any,
      {} as any,
      appleAuthService as any,
      configMock,
    );
    const res = makeRes();

    const out = await controller.apple(
      { id_token: 't' } as any,
      res,
      '1.1.1.1',
      'UA',
    );
    expect(appleAuthService.login).toHaveBeenCalledWith(
      { id_token: 't' },
      '1.1.1.1',
      'UA',
    );
    expect(out).toBe(SESSION);
    expect(res.cookie).toHaveBeenCalledWith(
      'avino_rt',
      'refresh',
      EXPECTED_COOKIE_OPTS,
    );
  });
});

describe('AuthController.refresh', () => {
  const rotated: RefreshResult = {
    access_token: 'access2',
    refresh_token: 'refresh2',
    token_type: 'Bearer',
    expires_in: 900,
  };

  it('reads the token from the avino_rt cookie (no body) and re-sets the cookie', async () => {
    const authService = { refresh: jest.fn().mockResolvedValue(rotated) };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );
    const res = makeRes();
    const req = { cookies: { avino_rt: 'cookie-rt' } } as any;

    const out = await controller.refresh({} as any, req, res, '1.1.1.1', 'UA');

    expect(authService.refresh).toHaveBeenCalledWith('cookie-rt', '1.1.1.1', 'UA');
    expect(out).toBe(rotated);
    expect(res.cookie).toHaveBeenCalledWith(
      'avino_rt',
      'refresh2',
      EXPECTED_COOKIE_OPTS,
    );
  });

  it('falls back to the body token when no cookie (mobile/Flutter flow)', async () => {
    const authService = { refresh: jest.fn().mockResolvedValue(rotated) };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );
    const res = makeRes();
    const req = { cookies: {} } as any;

    await controller.refresh(
      { refresh_token: 'body-rt' } as any,
      req,
      res,
      '1.1.1.1',
      'UA',
    );

    expect(authService.refresh).toHaveBeenCalledWith('body-rt', '1.1.1.1', 'UA');
    expect(res.cookie).toHaveBeenCalledWith(
      'avino_rt',
      'refresh2',
      EXPECTED_COOKIE_OPTS,
    );
  });

  it('prefers the cookie over the body when both are present', async () => {
    const authService = { refresh: jest.fn().mockResolvedValue(rotated) };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );
    const req = { cookies: { avino_rt: 'cookie-rt' } } as any;

    await controller.refresh(
      { refresh_token: 'body-rt' } as any,
      req,
      makeRes(),
      '1.1.1.1',
      'UA',
    );

    expect(authService.refresh).toHaveBeenCalledWith('cookie-rt', '1.1.1.1', 'UA');
  });

  it('throws 400 VALIDATION_ERROR when neither cookie nor body carries a token', async () => {
    const authService = { refresh: jest.fn() };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );
    const req = { cookies: {} } as any;

    await expect(
      controller.refresh({} as any, req, makeRes(), '1.1.1.1', 'UA'),
    ).rejects.toBeInstanceOf(BadRequestException);
    try {
      await controller.refresh({} as any, req, makeRes(), '1.1.1.1', 'UA');
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        code: ApiErrorCode.VALIDATION_ERROR,
      });
    }
    expect(authService.refresh).not.toHaveBeenCalled();
  });
});

describe('AuthController.logout', () => {
  it('revokes the family by the cookie token and clears the cookie', async () => {
    const authService = { logout: jest.fn().mockResolvedValue(undefined) };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );
    const res = makeRes();
    const req = { cookies: { avino_rt: 'cookie-rt' } } as any;

    await controller.logout({} as any, req, res, '1.1.1.1', 'UA');

    expect(authService.logout).toHaveBeenCalledWith('cookie-rt', '1.1.1.1', 'UA');
    // clearCookie получает те же domain/path (без maxAge), иначе браузер не удалит.
    expect(res.clearCookie).toHaveBeenCalledWith('avino_rt', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      domain: '.avino.uz',
      path: '/api/v1/auth',
    });
  });

  it('still works with the body token (mobile) and clears the cookie', async () => {
    const authService = { logout: jest.fn().mockResolvedValue(undefined) };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );
    const res = makeRes();
    const req = { cookies: {} } as any;

    await controller.logout(
      { refresh_token: 'body-rt' } as any,
      req,
      res,
      '1.1.1.1',
      'UA',
    );

    expect(authService.logout).toHaveBeenCalledWith('body-rt', '1.1.1.1', 'UA');
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('throws 400 when neither cookie nor body carries a token', async () => {
    const authService = { logout: jest.fn() };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
      configMock,
    );
    const req = { cookies: {} } as any;

    await expect(
      controller.logout({} as any, req, makeRes(), '1.1.1.1', 'UA'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authService.logout).not.toHaveBeenCalled();
  });
});
