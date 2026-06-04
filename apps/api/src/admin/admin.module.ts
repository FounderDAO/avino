import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation';
import { RolesModule } from '../roles';
import { AdminListingsController } from './admin-listings.controller';

/**
 * AdminModule — HTTP-слой админ/модераторских операций (TASK-053, M5).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) и проверку
 * ролей ({@link RolesGuard}); `ModerationModule` — бизнес-логику модерации.
 * Дальнейшие админ-роуты (complaints, audit-logs, admin/users) подключаются
 * сюда же по мере реализации.
 */
@Module({
  imports: [RolesModule, ModerationModule],
  controllers: [AdminListingsController],
})
export class AdminModule {}
