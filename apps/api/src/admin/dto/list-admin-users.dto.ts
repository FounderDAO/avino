import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserStatus } from '@prisma/client';
import { UserRole } from '@avino/shared';

/**
 * Query-параметры `GET /api/v1/admin/users` (TASK-130, API.md §6).
 *
 * Админ-список пользователей. В отличие от self-эндпоинтов (`/users/me`),
 * DELETED НЕ скрывается: админ должен видеть любые статусы (как и админ-список
 * объявлений в модерации). Без `status` — возвращаются все статусы.
 *
 * - `role` фильтрует по наличию роли (`user_roles.role.code`). GUEST намеренно
 *   не сидируется в БД (ADR-0011), поэтому фильтр по GUEST вернёт пустой список.
 * - `q` — свободный поиск по контакту (phone/email) и имени профиля
 *   (case-insensitive).
 * - Числа из query приводятся к `number` глобальным ValidationPipe
 *   (`enableImplicitConversion`) + явный `@Type`. Page-based пагинация (1-based)
 *   с обязательным `meta.total` (API.md §4).
 */
export class ListAdminUsersQueryDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  /** Свободный поиск по phone/email и имени профиля (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
