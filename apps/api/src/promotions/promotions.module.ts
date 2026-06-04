import { Module } from '@nestjs/common';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

/**
 * PromotionsModule — публичный каталог промо-планов (TASK-120, M12).
 *
 * Каталог статичен — ни Prisma, ни `RolesModule` не нужны (эндпоинт public).
 * `PromotionsService` экспортируется для переиспользования каталога в будущих
 * админ-задачах активации/продления (TASK-121/122).
 */
@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
