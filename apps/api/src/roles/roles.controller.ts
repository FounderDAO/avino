import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { RoleResponse, RolesService } from './roles.service';

/**
 * RolesController — справочник ролей (TASK-130, API.md §6).
 *
 * `GET /api/v1/roles` доступен ADMIN/MODERATOR (нужен для UI назначения ролей
 * и фильтров админ-панели). `JwtAuthGuard` + `RolesGuard` на классе.
 * Версионирование URI обязательно (CLAUDE.md §14); префикс `api` ставит main.ts.
 */
@Controller({ path: 'roles', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /** `GET /api/v1/roles` — справочник ролей (seeded dictionary, без GUEST). */
  @Get()
  list(): Promise<RoleResponse[]> {
    return this.rolesService.listRoles();
  }
}
