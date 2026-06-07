import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications';
import { AdminPromotionsService } from './admin-promotions.service';
import { PromotionExpiryService } from './promotion-expiry.service';
import { PromotionPlansService } from './promotion-plans.service';
import { PromotionWorker } from './promotion.worker';
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
 *
 * Фоновое истечение (TASK-123): {@link PromotionExpiryService} — бизнес-логика
 * sweep'а, {@link PromotionWorker} — консьюмер `promotion_queue` (расписание
 * ставит глобальный {@link PromotionQueue} из QueuesModule). Постановка
 * уведомлений делегируется {@link NotificationsService} (NotificationsModule).
 */
@Module({
  imports: [NotificationsModule],
  controllers: [PromotionsController],
  providers: [
    PromotionsService,
    PromotionPlansService,
    AdminPromotionsService,
    PromotionExpiryService,
    PromotionWorker,
  ],
  exports: [
    PromotionsService,
    PromotionPlansService,
    AdminPromotionsService,
    PromotionExpiryService,
  ],
})
export class PromotionsModule {}
