import { Module } from '@nestjs/common';
import { AdminPromotionsService } from './admin-promotions.service';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

/**
 * PromotionsModule — каталог промо-планов (TASK-120) + ручная админ-активация
 * VIP/TOP (TASK-121, M12).
 *
 * Публичный каталог ({@link PromotionsService}) статичен — БД не нужна.
 * {@link AdminPromotionsService} работает с ledger'ом `listing_promotions` через
 * глобальный Prisma (импорт не нужен) и экспортируется для HTTP-слоя в
 * AdminModule; его же переиспользует cancel/extend (TASK-122).
 */
@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService, AdminPromotionsService],
  exports: [PromotionsService, AdminPromotionsService],
})
export class PromotionsModule {}
