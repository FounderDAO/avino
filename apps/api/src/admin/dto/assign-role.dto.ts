import { IsEnum } from 'class-validator';
import { UserRole } from '@avino/shared';

/**
 * Тело запроса `POST /api/v1/admin/users/:id/roles` (TASK-130, API.md §6).
 *
 * Назначение роли пользователю. `role` — код из `UserRole` (@avino/shared),
 * совпадающий с сидируемым справочником `roles` (seed.ts). GUEST не является
 * хранимой ролью (ADR-0011): он проходит `@IsEnum`, но сервис отклонит его как
 * неизвестную роль (нет строки в `roles`) → `400 VALIDATION_ERROR`.
 */
export class AssignRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
