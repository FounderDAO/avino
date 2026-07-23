import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { SupportRequestsController } from './support-requests.controller';
import { SupportRequestsService } from './support-requests.service';

/**
 * SupportModule — обращения в поддержку с формы /help.
 *
 * Владеет бизнес-логикой ({@link SupportRequestsService}) и публичным роутом
 * `POST /support/requests`. `RolesModule` даёт Bearer-аутентификацию
 * ({@link OptionalJwtAuthGuard}) одним импортом; Prisma — глобальный модуль.
 * Сервис экспортируется для админ-роутов ({@link AdminSupportRequestsController}
 * в {@link AdminModule}).
 */
@Module({
  imports: [RolesModule],
  controllers: [SupportRequestsController],
  providers: [SupportRequestsService],
  exports: [SupportRequestsService],
})
export class SupportModule {}
