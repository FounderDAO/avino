import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@avino/shared';

/** Ключ метаданных, под которым хранится список требуемых ролей хендлера/класса. */
export const ROLES_KEY = 'roles';

/**
 * `@Roles(...)` — пометить хендлер или контроллер требуемыми ролями (TASK-044,
 * ADR-011 / CLAUDE.md §9).
 *
 * Сами роли проверяет {@link RolesGuard}, читая эти метаданные через `Reflector`.
 * Декоратор только декларативен и БЕЗ {@link JwtAuthGuard} ничего не защищает:
 * сначала аутентификация (Bearer → `request.user`), затем авторизация по ролям.
 *
 * Семантика — «любая из» (OR): доступ разрешён, если у пользователя есть хотя бы
 * одна из перечисленных ролей. `GUEST` здесь не используется — это неявное
 * состояние неаутентифицированного запроса (ADR-0008), а не код роли.
 *
 * @example
 * ```ts
 * @Roles(UserRole.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Get('admin/users')
 * listUsers() {}
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
