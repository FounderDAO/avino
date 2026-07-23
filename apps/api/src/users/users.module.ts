import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email';
import { RolesModule } from '../roles';
import { SettingsModule } from '../settings';
import { SmsModule } from '../sms';
import { TelegramModule } from '../telegram';
import { ProfilesService } from '../profiles';
import { UploadsModule } from '../uploads';
import { ContactChangeService } from './contact-change.service';
import { ContactPhoneChangeService } from './contact-phone-change.service';
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
 *
 * `AuthModule` даёт `OtpRateLimitService`, а `Sms/Email/TelegramModule` — доставку
 * кода для {@link ContactChangeService} (смена логин-контакта через OTP-verify);
 * OTP-примитивы жизненного цикла кода переиспользуются напрямую (`otp-code.util`),
 * без зависимости от всего `AuthService`.
 */
@Module({
  imports: [
    AuthModule,
    RolesModule,
    SettingsModule,
    UploadsModule,
    SmsModule,
    EmailModule,
    TelegramModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    ProfilesService,
    LegalConsentService,
    ContactChangeService,
    ContactPhoneChangeService,
  ],
  exports: [UsersService, ProfilesService],
})
export class UsersModule {}
