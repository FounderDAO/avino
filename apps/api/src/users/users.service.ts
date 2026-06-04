import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Language, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import {
  ProfileResponse,
  toProfileResponse,
} from '../profiles/profiles.service';
import { UpdateUserDto } from './dto/update-user.dto';

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
    contactPhone: string | null;
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
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
   * `PATCH /api/v1/users/me` — обновление базовых полей.
   * Смена `email` сбрасывает `is_email_verified` (нужен re-verify) и проверяет
   * уникальность контакта среди non-DELETED аккаунтов (CONTACT_TAKEN, ADR-013).
   */
  async updateMe(userId: string, dto: UpdateUserDto): Promise<UserMeResponse> {
    const current = await this.prisma.user.findFirst({
      where: { id: userId, status: { not: UserStatus.DELETED } },
      include: ME_INCLUDE,
    });
    if (!current) {
      throw this.gone();
    }

    const data: {
      email?: string;
      isEmailVerified?: boolean;
      defaultLanguage?: Language;
    } = {};

    if (dto.default_language !== undefined) {
      data.defaultLanguage = dto.default_language;
    }

    // Смена email — только если значение реально меняется: иначе не сбрасываем
    // verified-флаг и не гоняем лишний uniqueness-запрос.
    if (dto.email !== undefined && dto.email !== current.email) {
      const taken = await this.prisma.user.findFirst({
        where: {
          email: dto.email,
          status: { not: UserStatus.DELETED },
          id: { not: userId },
        },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException({
          code: ApiErrorCode.CONTACT_TAKEN,
          message: 'Email is already in use',
        });
      }
      data.email = dto.email;
      data.isEmailVerified = false;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: ME_INCLUDE,
    });
    return this.toMe(updated);
  }

  private toMe(user: UserWithRelations): UserMeResponse {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      status: user.status,
      default_language: user.defaultLanguage,
      is_phone_verified: user.isPhoneVerified,
      is_email_verified: user.isEmailVerified,
      roles: user.roles.map((r) => r.role.code),
      profile: user.profile ? toProfileResponse(user.profile) : null,
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
