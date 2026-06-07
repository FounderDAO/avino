import { Injectable } from '@nestjs/common';
import { PromotionPlansService, PromotionPlanView } from './promotion-plans.service';

export interface PromotionPlansResponse {
  plans: PromotionPlanView[];
}

@Injectable()
export class PromotionsService {
  constructor(private readonly plans: PromotionPlansService) {}

  /** Публичный каталог: только активные планы. */
  async getPlans(): Promise<PromotionPlansResponse> {
    return { plans: await this.plans.listPlans({ activeOnly: true }) };
  }
}
