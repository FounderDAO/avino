import {
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Language, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { UsersService } from './users.service';

/**
 * Юнит-тесты UsersService (TASK-040). Prisma мокается — проверяются сборка
 * `/me`-ответа (роли + профиль), сброс is_email_verified при смене email,
 * CONTACT_TAKEN и трактовка отсутствующего/DELETED аккаунта как 401.
 */
describe('UsersService', () => {
  const USER_ID = 'u1';

  let prisma: any;
  let service: UsersService;

  const dbUser = {
    id: USER_ID,
    phone: '+998901234567',
    email: null,
    status: UserStatus.ACTIVE,
    defaultLanguage: Language.RU,
    isPhoneVerified: true,
    isEmailVerified: false,
    roles: [{ role: { code: 'USER' } }, { role: { code: 'AGENT' } }],
    profile: {
      firstName: 'Ali',
      lastName: 'Valiev',
      displayName: 'Ali V.',
      avatarUrl: null,
      contactPhone: '+998901234567',
      preferredLanguage: Language.RU,
    },
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new UsersService(prisma);
  });

  async function expectCode(promise: Promise<unknown>, code: ApiErrorCode) {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      const res = (e as HttpException).getResponse() as { code: string };
      expect(res.code).toBe(code);
    }
  }

  describe('getMe', () => {
    it('returns user with roles and profile in the snake_case contract', async () => {
      prisma.user.findFirst.mockResolvedValue(dbUser);

      const result = await service.getMe(USER_ID);

      expect(result).toEqual({
        id: USER_ID,
        phone: '+998901234567',
        email: null,
        status: UserStatus.ACTIVE,
        default_language: Language.RU,
        is_phone_verified: true,
        is_email_verified: false,
        roles: ['USER', 'AGENT'],
        profile: {
          first_name: 'Ali',
          last_name: 'Valiev',
          display_name: 'Ali V.',
          avatar_url: null,
          contact_phone: '+998901234567',
          preferred_language: Language.RU,
        },
      });
      // DELETED-аккаунты невидимы (soft-delete, ADR-013).
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID, status: { not: UserStatus.DELETED } },
        }),
      );
    });

    it('returns profile: null when the user has no profile yet', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...dbUser, profile: null });
      const result = await service.getMe(USER_ID);
      expect(result.profile).toBeNull();
    });

    it('throws 401 UNAUTHORIZED when the account is gone/DELETED', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expectCode(service.getMe(USER_ID), ApiErrorCode.UNAUTHORIZED);
      await expect(service.getMe(USER_ID)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('updateMe', () => {
    it('updates default_language without touching email', async () => {
      prisma.user.findFirst.mockResolvedValue(dbUser);
      prisma.user.update.mockResolvedValue({
        ...dbUser,
        defaultLanguage: Language.UZ,
      });

      const result = await service.updateMe(USER_ID, {
        default_language: Language.UZ,
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: { defaultLanguage: Language.UZ },
        }),
      );
      expect(result.default_language).toBe(Language.UZ);
    });

    it('resets is_email_verified when email changes', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce(dbUser) // current
        .mockResolvedValueOnce(null); // uniqueness check → free
      prisma.user.update.mockResolvedValue({
        ...dbUser,
        email: 'ali@mail.uz',
        isEmailVerified: false,
      });

      await service.updateMe(USER_ID, { email: 'ali@mail.uz' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { email: 'ali@mail.uz', isEmailVerified: false },
        }),
      );
    });

    it('does not re-check or reset when email is unchanged', async () => {
      const withEmail = { ...dbUser, email: 'ali@mail.uz' };
      prisma.user.findFirst.mockResolvedValue(withEmail);
      prisma.user.update.mockResolvedValue(withEmail);

      await service.updateMe(USER_ID, { email: 'ali@mail.uz' });

      // Только начальный findFirst (current); uniqueness-запрос не выполнялся.
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: {} }),
      );
    });

    it('throws 409 CONTACT_TAKEN when email belongs to another active user', async () => {
      // current → dbUser; uniqueness check → another user holds the email.
      prisma.user.findFirst.mockImplementation((args: any) =>
        args.where.id?.not === USER_ID ? { id: 'other' } : dbUser,
      );

      const promise = service.updateMe(USER_ID, { email: 'taken@mail.uz' });
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      try {
        await promise;
      } catch (e) {
        const res = (e as HttpException).getResponse() as { code: string };
        expect(res.code).toBe(ApiErrorCode.CONTACT_TAKEN);
      }
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws 401 UNAUTHORIZED when the account is gone/DELETED', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expectCode(
        service.updateMe(USER_ID, { default_language: Language.EN }),
        ApiErrorCode.UNAUTHORIZED,
      );
    });
  });
});
