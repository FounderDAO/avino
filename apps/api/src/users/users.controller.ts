import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { ProfileResponse, ProfilesService } from '../profiles';
import { UpdateProfileDto } from '../profiles/dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserMeResponse, UsersService } from './users.service';

/**
 * UsersController — собственный аккаунт пользователя (TASK-040, API.md §5).
 *
 * Все эндпоинты под `@UseGuards(JwtAuthGuard)` (Auth: Bearer): `@CurrentUser('id')`
 * берёт `sub` из access-токена, поэтому пользователь всегда работает только со
 * своей записью — `:id` в путях нет. Версионирование URI (`/api/v1/users/...`)
 * обязательно (CLAUDE.md §14); префикс `api` ставит main.ts.
 */
@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
  ) {}

  /** `GET /api/v1/users/me` — текущий пользователь, профиль и роли. */
  @Get('me')
  getMe(@CurrentUser('id') userId: string): Promise<UserMeResponse> {
    return this.usersService.getMe(userId);
  }

  /** `PATCH /api/v1/users/me` — базовые поля (email, default_language). */
  @Patch('me')
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserMeResponse> {
    return this.usersService.updateMe(userId, dto);
  }

  /** `PATCH /api/v1/users/me/profile` — профиль (создаётся, если отсутствует). */
  @Patch('me/profile')
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    return this.profilesService.updateForUser(userId, dto);
  }
}
