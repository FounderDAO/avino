import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

/**
 * Тело запроса `PATCH /api/v1/admin/users/:id` (TASK-130, API.md §6).
 *
 * Админ меняет `status` пользователя (`ACTIVE | BLOCKED | DELETED`). Действие
 * пишется в `audit_logs` (`ADMIN_USER_UPDATE`). `reason` опционален и попадает
 * в `metadata` аудита (зачем заблокирован/удалён).
 *
 * Перевод в `DELETED` — это soft-delete: сервис проставляет `deleted_at`
 * (инвариант «DELETED ⇒ deleted_at установлен», ADR-0013); возврат из DELETED
 * сбрасывает `deleted_at`. Освобождение контакта (phone/email) для повторного
 * использования здесь не выполняется — это отдельный self-delete flow.
 *
 * Имена свойств — snake_case ключи контракта (как в остальных DTO).
 */
export class UpdateAdminUserDto {
  @IsEnum(UserStatus)
  status!: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
