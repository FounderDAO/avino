import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Language, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import {
  ProfileResponse,
  toProfileResponse,
} from '../profiles/profiles.service';
import { UploadsService } from '../uploads';
import { resolveAvatarUrl } from './avatar-url.util';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * Загруженный proxy-файл аватара (multipart), минимальный контракт — как у
 * `UploadedImageFile` в `listing-media.service.ts` (одна и та же форма,
 * которую кладёт `FileInterceptor` с memory storage).
 */
export interface UploadedAvatarFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Allow-list MIME → расширение ключа S3 для аватара. Значения совпадают с
 * `ALLOWED_IMAGE_MIME` в `listing-media.service.ts` (тот же MVP-набор:
 * только изображения) — не импортируем оттуда, чтобы не тянуть зависимость
 * между доменами вне заявленного scope задачи; держать в синхронности при
 * расширении allow-list'а медиа объявлений.
 */
const ALLOWED_AVATAR_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Максимальный размер файла аватара — как у медиа объявлений (10 MiB). */
const MAX_AVATAR_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Текущий пользователь + профиль + роли (API.md §3 `auth/me` / §5 `users/me`).
 * Тот же snake_case контракт, что и блок `user` в ответе verify
 * ({@link AuthUserSummary}), плюс вложенный `profile`.
 */
export interface UserMeResponse {
  id: string;
  phone: string | null;
  email: string | null;
  status: UserStatus;
  default_language: Language;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  roles: string[];
  profile: ProfileResponse | null;
}

/** Пользователь со связями, как его отдаёт Prisma `include`. */
interface UserWithRelations {
  id: string;
  phone: string | null;
  email: string | null;
  status: UserStatus;
  defaultLanguage: Language;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  roles: { role: { code: string } }[];
  profile: {
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    avatarStorageKey: string | null;
    contactPhone: string | null;
    contactPhoneVerified: boolean;
    preferredLanguage: Language | null;
  } | null;
}

const ME_INCLUDE = {
  profile: true,
  roles: { include: { role: true } },
} as const;

/**
 * UsersService — чтение и обновление собственного аккаунта (TASK-040, API.md §5).
 *
 * Источник истины для `/me` — БД (а не payload токена): роли/профиль читаются
 * свежими `include`. DELETED-аккаунты невидимы даже по валидному токену
 * (soft-delete освобождает контакт, ADR-013) → `401 UNAUTHORIZED`.
 *
 * Аватар (TASK-248, ADR-0134): `POST/DELETE /api/v1/users/me/avatar` грузят
 * файл в S3/R2 через {@link UploadsService} тем же способом, что и медиа
 * объявлений (`ListingMediaService`), но результат — отдельная колонка
 * `user_profiles.avatar_storage_key`, а не `avatar_url` (тот хранит внешнюю
 * ссылку OAuth-провайдера и не должен перезаписываться).
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /** `GET /api/v1/users/me` — текущий пользователь, профиль и роли. */
  async getMe(userId: string): Promise<UserMeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: UserStatus.DELETED } },
      include: ME_INCLUDE,
    });
    if (!user) {
      throw this.gone();
    }
    return this.toMe(user);
  }

  /**
   * `POST /api/v1/users/me/avatar` — загрузка аватара (multipart, поле `file`,
   * TASK-248, ADR-0134). Валидирует MIME (allow-list) и размер — как
   * `ListingMediaService.uploadFile` — грузит в S3/R2 через
   * {@link UploadsService} и сохраняет `avatar_storage_key` в профиль текущего
   * пользователя (upsert — профиль создаётся лениво, ADR-0010, если ещё нет).
   * Возвращает свежую подписанную ссылку.
   */
  async uploadAvatar(
    userId: string,
    file: UploadedAvatarFile | undefined,
  ): Promise<{ avatar_url: string }> {
    if (!file) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'File is required (multipart field "file")',
      });
    }

    const extension = ALLOWED_AVATAR_MIME[file.mimetype];
    if (!extension) {
      throw new UnsupportedMediaTypeException({
        code: ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: 'Allowed types: image/jpeg, image/png, image/webp',
      });
    }
    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        code: ApiErrorCode.FILE_TOO_LARGE,
        message: `File exceeds the ${MAX_AVATAR_FILE_SIZE_BYTES} byte limit`,
      });
    }

    const previous = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarStorageKey: true },
    });

    const root = this.uploads.rootPrefix();
    const prefix = [root, 'users', userId, 'avatar'].filter(Boolean).join('/');
    const { key } = await this.uploads.upload({
      buffer: file.buffer,
      contentType: file.mimetype,
      prefix,
      extension,
    });

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, avatarStorageKey: key },
      update: { avatarStorageKey: key },
    });

    // Best-effort: подчистить предыдущий объект аватара (замена файла, не
    // первая загрузка). Ошибка S3 не валит запрос — DB-запись (source of
    // truth) уже обновлена, осиротевший объект переживёт неудалённым.
    if (previous?.avatarStorageKey && previous.avatarStorageKey !== key) {
      try {
        await this.uploads.delete(previous.avatarStorageKey);
      } catch (error) {
        this.logger.warn(
          `Failed to delete previous avatar object for user ${userId}: ${String(error)}`,
        );
      }
    }

    return { avatar_url: await this.uploads.getObjectUrl(key) };
  }

  /**
   * `DELETE /api/v1/users/me/avatar` — убрать аватар (TASK-248, ADR-0134).
   * Обнуляет `avatar_storage_key`; после этого `avatar_url` в ответах либо
   * снова станет ссылкой OAuth-провайдера (`avatarUrl`), либо `null`.
   * Идемпотентно: если аватара нет, ничего не делает. `204` независимо от
   * результата (см. контроллер).
   */
  async deleteAvatar(userId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarStorageKey: true },
    });
    if (!profile?.avatarStorageKey) {
      return;
    }

    await this.prisma.userProfile.update({
      where: { userId },
      data: { avatarStorageKey: null },
    });

    try {
      await this.uploads.delete(profile.avatarStorageKey);
    } catch (error) {
      this.logger.warn(
        `Failed to delete avatar object for user ${userId}: ${String(error)}`,
      );
    }
  }

  /**
   * `PATCH /api/v1/users/me` — обновление базовых полей (`default_language`).
   * Смена логин-контакта (email/phone) выполняется отдельным OTP-verify-флоу
   * ({@link ContactChangeService}), а не здесь.
   */
  async updateMe(userId: string, dto: UpdateUserDto): Promise<UserMeResponse> {
    const current = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: UserStatus.DELETED } },
      include: ME_INCLUDE,
    });
    if (!current) {
      throw this.gone();
    }

    const data: { defaultLanguage?: Language } = {};

    if (dto.default_language !== undefined) {
      data.defaultLanguage = dto.default_language;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: ME_INCLUDE,
    });
    return this.toMe(updated);
  }

  /**
   * Собрать `/me`-ответ. `profile.avatar_url` резолвится через
   * {@link resolveAvatarUrl} (ADR-0134): `avatarStorageKey`, если задан,
   * перекрывает `avatarUrl` из {@link toProfileResponse}.
   */
  private async toMe(user: UserWithRelations): Promise<UserMeResponse> {
    const profile = user.profile
      ? {
          ...toProfileResponse(user.profile),
          avatar_url: await resolveAvatarUrl(
            this.uploads,
            user.profile.avatarStorageKey,
            user.profile.avatarUrl,
          ),
        }
      : null;

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      status: user.status,
      default_language: user.defaultLanguage,
      is_phone_verified: user.isPhoneVerified,
      is_email_verified: user.isEmailVerified,
      roles: user.roles.map((r) => r.role.code),
      profile,
    };
  }

  /** Валидный токен, но аккаунта уже нет/он DELETED → трактуем как 401. */
  private gone(): UnauthorizedException {
    return new UnauthorizedException({
      code: ApiErrorCode.UNAUTHORIZED,
      message: 'Account not found or inactive',
    });
  }
}
