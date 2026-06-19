import { AuthController } from './auth.controller';
import { MeResponse } from './dto/me-response.dto';

/**
 * Юнит-тесты `AuthController` (TASK-045). Контроллер — тонкая обёртка над
 * сервисами; здесь проверяется, что `GET /auth/me` делегирует в
 * `AuthService.getMe` с id текущего пользователя (его кладёт `JwtAuthGuard` →
 * `@CurrentUser('id')`) и пробрасывает ответ-контракт без изменений.
 */
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
        preferred_language: 'RU',
      },
    };
    const authService = { getMe: jest.fn().mockResolvedValue(me) };
    const controller = new AuthController(
      {} as any,
      authService as any,
      {} as any,
      {} as any,
    );

    await expect(controller.me('u1')).resolves.toBe(me);
    expect(authService.getMe).toHaveBeenCalledWith('u1');
  });
});

describe('AuthController.google', () => {
  it('delegates to GoogleAuthService.login with body, ip and user-agent', async () => {
    const result = { access_token: 'a' };
    const googleAuthService = { login: jest.fn().mockResolvedValue(result) };
    const controller = new AuthController(
      {} as any,
      {} as any,
      googleAuthService as any,
      {} as any,
    );

    const res = await controller.google(
      { id_token: 't' } as any,
      '1.1.1.1',
      'UA',
    );
    expect(googleAuthService.login).toHaveBeenCalledWith(
      { id_token: 't' },
      '1.1.1.1',
      'UA',
    );
    expect(res).toBe(result);
  });
});

describe('AuthController.apple', () => {
  it('delegates to AppleAuthService.login with body, ip and user-agent', async () => {
    const result = { access_token: 'a' };
    const appleAuthService = { login: jest.fn().mockResolvedValue(result) };
    const controller = new AuthController(
      {} as any,
      {} as any,
      {} as any,
      appleAuthService as any,
    );

    const res = await controller.apple(
      { id_token: 't' } as any,
      '1.1.1.1',
      'UA',
    );
    expect(appleAuthService.login).toHaveBeenCalledWith(
      { id_token: 't' },
      '1.1.1.1',
      'UA',
    );
    expect(res).toBe(result);
  });
});
