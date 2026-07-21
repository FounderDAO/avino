import { Language } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * Тело запроса `PATCH /api/v1/users/me/profile` (TASK-040, API.md §5).
 *
 * Все поля опциональны — обновляется только переданное подмножество (PATCH-
 * семантика); профиль создаётся при первом обновлении, если его ещё нет
 * (см. {@link ProfilesService.updateForUser}). Лимиты длины повторяют
 * `user_profiles` (DB_SCHEMA.md §4 / Prisma `UserProfile`).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  display_name?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  avatar_url?: string;

  @IsOptional()
  @IsEnum(Language)
  preferred_language?: Language;
}
