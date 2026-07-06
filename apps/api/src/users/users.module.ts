import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { SettingsModule } from '../settings';
import { ProfilesService } from '../profiles';
import { UploadsModule } from '../uploads';
import { LegalConsentService } from './legal-consent.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * UsersModule — профиль и базовые поля собственного аккаунта (TASK-040, M4).
 *
 * `JwtAuthGuard` защищает все эндпоинты контроллера; его (вместе с нужным
 * `JwtModule`) даёт импорт `RolesModule` — единый RBAC-слой (TASK-044). Prisma —
 * глобальный модуль, импорт не нужен.
 *
 * ProfilesService живёт в `../profiles` (concern профиля отделён от core-user),
 * но провайдится здесь — `/users/me/profile` обслуживает тот же контроллер.
 *
 * `UploadsModule` — {@link UploadsService} для `POST/DELETE /users/me/avatar`
 * (TASK-248, ADR-0134), тем же способом, что и `ListingMediaModule`.
 */
@Module({
  imports: [RolesModule, SettingsModule, UploadsModule],
  controllers: [UsersController],
  providers: [UsersService, ProfilesService, LegalConsentService],
  exports: [UsersService, ProfilesService],
})
export class UsersModule {}
