import { Controller, Get } from '@nestjs/common';
import {
  PromotionPlansResponse,
  PromotionsService,
} from './promotions.service';

/**
 * PromotionsController — публичный каталог промо-планов (TASK-120, API.md §15).
 *
 * Auth: public (гайды не подключаются) — каталог цен видят гости и mobile.
 * Версионирование URI обязательно (CLAUDE.md §14); префикс `api` ставит main.ts
 * → `GET /api/v1/promotions/plans`. Админ-действия над промо — отдельный
 * контроллер под ADMIN (TASK-121).
 */
@Controller({ path: 'promotions', version: '1' })
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  /** `GET /api/v1/promotions/plans` — каталог TOP/VIP × 7/14/30 дней. */
  @Get('plans')
  getPlans(): Promise<PromotionPlansResponse> {
    return this.promotionsService.getPlans();
  }
}
