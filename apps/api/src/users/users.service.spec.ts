import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Language, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { UploadedAvatarFile, UsersService } from './users.service';

/**
 * Юнит-тесты UsersService (TASK-040, + TASK-248 аватар). Prisma и Uploads
 * мокаются — проверяются сборка `/me`-ответа (роли + профиль + avatar_url
 * приоритет storage_key), обновление default_language, трактовка
 * отсутствующего/DELETED аккаунта как 401, а также upload/delete аватара
 * (allow-list MIME, лимит размера, upsert профиля, best-effort очистка
 * предыдущего объекта в R2).
 */
describe('UsersService', () => {
  const USER_ID = 'u1';

  let prisma: any;
  let uploads: any;
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
      avatarStorageKey: null,
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
      userProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };
    uploads = {
      rootPrefix: jest.fn().mockReturnValue(''),
      upload: jest.fn(),
      delete: jest.fn(),
      getObjectUrl: jest.fn(),
    };
    service = new UsersService(prisma, uploads);
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

    it('resolves avatar_url via a signed R2 URL when avatar_storage_key is set, overriding avatarUrl', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...dbUser,
        profile: {
          ...dbUser.profile,
          avatarUrl: 'https://accounts.google.com/photo.jpg',
          avatarStorageKey: 'users/u1/avatar/abc.jpg',
        },
      });
      uploads.getObjectUrl.mockResolvedValue('https://r2.example/signed?x=1');

      const result = await service.getMe(USER_ID);

      expect(uploads.getObjectUrl).toHaveBeenCalledWith('users/u1/avatar/abc.jpg');
      expect(result.profile?.avatar_url).toBe('https://r2.example/signed?x=1');
    });

    it('falls back to the provider avatarUrl when no avatar_storage_key is set', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...dbUser,
        profile: {
          ...dbUser.profile,
          avatarUrl: 'https://accounts.google.com/photo.jpg',
          avatarStorageKey: null,
        },
      });

      const result = await service.getMe(USER_ID);

      expect(uploads.getObjectUrl).not.toHaveBeenCalled();
      expect(result.profile?.avatar_url).toBe('https://accounts.google.com/photo.jpg');
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

    // Смена email/phone перенесена в OTP-verify-флоу
    // (ContactChangeService, `POST /users/me/contact-change/*`), поэтому
    // PATCH /me больше не трогает контакт — соответствующие тесты живут в
    // contact-change.service.spec.ts.

    it('throws 401 UNAUTHORIZED when the account is gone/DELETED', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expectCode(
        service.updateMe(USER_ID, { default_language: Language.EN }),
        ApiErrorCode.UNAUTHORIZED,
      );
    });
  });

  describe('uploadAvatar', () => {
    const file: UploadedAvatarFile = {
      buffer: Buffer.from('fake-image'),
      mimetype: 'image/jpeg',
      originalname: 'photo.jpg',
      size: 1024,
    };

    it('throws 400 VALIDATION_ERROR when no file is provided', async () => {
      await expectCode(
        service.uploadAvatar(USER_ID, undefined),
        ApiErrorCode.VALIDATION_ERROR,
      );
      await expect(
        service.uploadAvatar(USER_ID, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 415 UNSUPPORTED_MEDIA_TYPE for a disallowed MIME type', async () => {
      const promise = service.uploadAvatar(USER_ID, {
        ...file,
        mimetype: 'application/pdf',
      });
      await expectCode(promise, ApiErrorCode.UNSUPPORTED_MEDIA_TYPE);
      await expect(
        service.uploadAvatar(USER_ID, { ...file, mimetype: 'application/pdf' }),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    });

    it('throws 413 FILE_TOO_LARGE when the file exceeds the size limit', async () => {
      const oversized = { ...file, size: 11 * 1024 * 1024 };
      const promise = service.uploadAvatar(USER_ID, oversized);
      await expectCode(promise, ApiErrorCode.FILE_TOO_LARGE);
      await expect(service.uploadAvatar(USER_ID, oversized)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
    });

    it('uploads to R2, upserts avatar_storage_key and returns a signed avatar_url', async () => {
      prisma.userProfile.findUnique.mockResolvedValue(null);
      uploads.upload.mockResolvedValue({
        key: 'users/u1/avatar/new.jpg',
        url: 'https://r2.example/users/u1/avatar/new.jpg',
      });
      uploads.getObjectUrl.mockResolvedValue('https://r2.example/signed?x=2');

      const result = await service.uploadAvatar(USER_ID, file);

      expect(uploads.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          buffer: file.buffer,
          contentType: 'image/jpeg',
          prefix: 'users/u1/avatar',
          extension: '.jpg',
        }),
      );
      expect(prisma.userProfile.upsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        create: { userId: USER_ID, avatarStorageKey: 'users/u1/avatar/new.jpg' },
        update: { avatarStorageKey: 'users/u1/avatar/new.jpg' },
      });
      expect(result).toEqual({ avatar_url: 'https://r2.example/signed?x=2' });
      // Первая загрузка — нечего чистить.
      expect(uploads.delete).not.toHaveBeenCalled();
    });

    it('best-effort deletes the previous avatar object when replacing it', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        avatarStorageKey: 'users/u1/avatar/old.jpg',
      });
      uploads.upload.mockResolvedValue({
        key: 'users/u1/avatar/new.jpg',
        url: 'https://r2.example/users/u1/avatar/new.jpg',
      });
      uploads.getObjectUrl.mockResolvedValue('https://r2.example/signed?x=3');

      await service.uploadAvatar(USER_ID, file);

      expect(uploads.delete).toHaveBeenCalledWith('users/u1/avatar/old.jpg');
    });

    it('does not fail the request when best-effort cleanup of the previous object fails', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        avatarStorageKey: 'users/u1/avatar/old.jpg',
      });
      uploads.upload.mockResolvedValue({
        key: 'users/u1/avatar/new.jpg',
        url: 'https://r2.example/users/u1/avatar/new.jpg',
      });
      uploads.getObjectUrl.mockResolvedValue('https://r2.example/signed?x=4');
      uploads.delete.mockRejectedValue(new Error('S3 unavailable'));

      await expect(service.uploadAvatar(USER_ID, file)).resolves.toEqual({
        avatar_url: 'https://r2.example/signed?x=4',
      });
    });
  });

  describe('deleteAvatar', () => {
    it('does nothing when the profile has no avatar_storage_key', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({ avatarStorageKey: null });

      await service.deleteAvatar(USER_ID);

      expect(prisma.userProfile.update).not.toHaveBeenCalled();
      expect(uploads.delete).not.toHaveBeenCalled();
    });

    it('clears avatar_storage_key and best-effort deletes the R2 object', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        avatarStorageKey: 'users/u1/avatar/old.jpg',
      });

      await service.deleteAvatar(USER_ID);

      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data: { avatarStorageKey: null },
      });
      expect(uploads.delete).toHaveBeenCalledWith('users/u1/avatar/old.jpg');
    });

    it('does not throw when the best-effort R2 delete fails', async () => {
      prisma.userProfile.findUnique.mockResolvedValue({
        avatarStorageKey: 'users/u1/avatar/old.jpg',
      });
      uploads.delete.mockRejectedValue(new Error('S3 unavailable'));

      await expect(service.deleteAvatar(USER_ID)).resolves.toBeUndefined();
    });
  });
});
