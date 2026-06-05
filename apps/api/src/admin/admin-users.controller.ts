import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PaginatedResponse } from '../moderation';
import {
  AdminUserDetail,
  AdminUserListItem,
  AdminUsersService,
} from './admin-users.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ListAdminUsersQueryDto } from './dto/list-admin-users.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

/**
 * AdminUsersController — управление пользователями и ролями (TASK-130, API.md §6).
 *
 * Все роуты под `/api/v1/admin/users` доступны только ADMIN — `JwtAuthGuard` +
 * `RolesGuard` на классе с `@Roles(ADMIN)`. Версионирование URI обязательно
 * (CLAUDE.md §14); префикс `api` ставит main.ts. `:role` валидируется
 * `ParseEnumPipe(UserRole)` (невалидный код → 400 ещё до сервиса).
 */
@Controller({ path: 'admin/users', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  /** `GET /api/v1/admin/users` — пагинированный список пользователей. */
  @Get()
  list(
    @Query() query: ListAdminUsersQueryDto,
  ): Promise<PaginatedResponse<AdminUserListItem>> {
    return this.adminUsersService.listUsers(query);
  }

  /** `GET /api/v1/admin/users/:id` — карточка пользователя. */
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) userId: string): Promise<AdminUserDetail> {
    return this.adminUsersService.getUser(userId);
  }

  /** `PATCH /api/v1/admin/users/:id` — смена статуса (audit ADMIN_USER_UPDATE). */
  @Patch(':id')
  updateStatus(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateAdminUserDto,
  ): Promise<AdminUserDetail> {
    return this.adminUsersService.updateStatus(adminId, userId, dto);
  }

  /** `POST /api/v1/admin/users/:id/roles` — назначить роль (audit ROLE_CHANGE). */
  @Post(':id/roles')
  assignRole(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: AssignRoleDto,
  ): Promise<AdminUserDetail> {
    return this.adminUsersService.assignRole(adminId, userId, dto);
  }

  /** `DELETE /api/v1/admin/users/:id/roles/:role` — снять роль → `204`. */
  @Delete(':id/roles/:role')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRole(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) userId: string,
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
  ): Promise<void> {
    return this.adminUsersService.removeRole(adminId, userId, role);
  }
}
