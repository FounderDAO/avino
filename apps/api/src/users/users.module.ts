import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { SettingsModule } from '../settings';
import { ProfilesService } from '../profiles';
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
 */
@Module({
  imports: [RolesModule, SettingsModule],
  controllers: [UsersController],
  providers: [UsersService, ProfilesService, LegalConsentService],
  exports: [UsersService, ProfilesService],
})
export class UsersModule {}
