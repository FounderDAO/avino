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
    const controller = new AuthController({} as any, authService as any);

    await expect(controller.me('u1')).resolves.toBe(me);
    expect(authService.getMe).toHaveBeenCalledWith('u1');
  });
});
