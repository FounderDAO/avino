import { Injectable } from '@nestjs/common';
import { Language } from '@prisma/client';
import { PrismaService } from '../prisma';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Профиль пользователя в ответе API (snake_case контракт, API.md §3/§5). */
export interface ProfileResponse {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  contact_phone: string | null;
  preferred_language: Language | null;
}

/** Строка `user_profiles`, из которой собирается {@link ProfileResponse}. */
interface ProfileRow {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  contactPhone: string | null;
  preferredLanguage: Language | null;
}

/** Маппинг camelCase-строки Prisma → snake_case контракт API. */
export function toProfileResponse(profile: ProfileRow): ProfileResponse {
  return {
    first_name: profile.firstName,
    last_name: profile.lastName,
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl,
    contact_phone: profile.contactPhone,
    preferred_language: profile.preferredLanguage,
  };
}

/**
 * ProfilesService — чтение и обновление `user_profiles` (TASK-040, API.md §5).
 *
 * Профиль связан 1:1 с пользователем (`user_profiles.user_id @unique`). При OTP-
 * логине профиль НЕ создаётся (минимальный signup, ADR-0010), поэтому первое
 * `PATCH /users/me/profile` должно его создать — отсюда `upsert` (acceptance:
 * "User profile is created if missing").
 */
@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Профиль пользователя или `null`, если ещё не создан. */
  async getByUserId(userId: string): Promise<ProfileResponse | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    return profile ? toProfileResponse(profile) : null;
  }

  /**
   * Частичное обновление профиля; создаёт строку при первом вызове.
   * `undefined`-поля Prisma игнорирует — так PATCH не затирает непереданные
   * значения; в `create` они дадут NULL (дефолт колонок).
   */
  async updateForUser(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    const data = {
      firstName: dto.first_name,
      lastName: dto.last_name,
      displayName: dto.display_name,
      avatarUrl: dto.avatar_url,
      contactPhone: dto.contact_phone,
      preferredLanguage: dto.preferred_language,
    };

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return toProfileResponse(profile);
  }
}
