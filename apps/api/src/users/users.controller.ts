import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { ProfileResponse, ProfilesService } from '../profiles';
import { UpdateProfileDto } from '../profiles/dto/update-profile.dto';
import { AcceptLegalConsentDto } from './dto/accept-legal-consent.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LegalConsentService, LegalConsentState } from './legal-consent.service';
import {
  UploadedAvatarFile,
  UserMeResponse,
  UsersService,
} from './users.service';

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
    private readonly legalConsentService: LegalConsentService,
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

  /** `POST /api/v1/users/me/legal-consent` — согласие с Правилами и Политикой. */
  @Post('me/legal-consent')
  acceptLegalConsent(
    @CurrentUser('id') userId: string,
    @Body() dto: AcceptLegalConsentDto,
  ): Promise<LegalConsentState> {
    return this.legalConsentService.record(userId, dto);
  }

  /**
   * `POST /api/v1/users/me/avatar` — загрузка аватара (TASK-248, ADR-0134).
   * `multipart/form-data`, поле `file` — та же proxy-загрузка, что и у медиа
   * объявлений (`ListingMediaController.upload`).
   */
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: UploadedAvatarFile | undefined,
  ): Promise<{ avatar_url: string }> {
    return this.usersService.uploadAvatar(userId, file);
  }

  /** `DELETE /api/v1/users/me/avatar` — убрать аватар (TASK-248, ADR-0134). */
  @Delete('me/avatar')
  @HttpCode(204)
  async deleteAvatar(@CurrentUser('id') userId: string): Promise<void> {
    await this.usersService.deleteAvatar(userId);
  }
}
