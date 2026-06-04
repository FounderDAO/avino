import { Currency, PromotionType } from '@prisma/client';
import { PromotionsService } from './promotions.service';

/**
 * Юнит-тесты PromotionsService (TASK-120). Каталог статичен (БД нет), поэтому
 * проверяем форму ответа: ровно 6 планов (TOP/VIP × 7/14/30), цены/валюта по
 * согласованной матрице, snake_case `period_days`, корректный Decimal-формат
 * и иммутабельность возврата (внешняя мутация не ломает каталог).
 */
describe('PromotionsService', () => {
  let service: PromotionsService;

  beforeEach(() => {
    service = new PromotionsService();
  });

  it('возвращает ровно 6 планов: TOP/VIP × 7/14/30', () => {
    const { plans } = service.getPlans();
    expect(plans).toHaveLength(6);

    const key = (t: PromotionType, d: number) => `${t}:${d}`;
    const got = new Set(plans.map((p) => key(p.type, p.period_days)));
    for (const type of [PromotionType.TOP, PromotionType.VIP]) {
      for (const days of [7, 14, 30]) {
        expect(got.has(key(type, days))).toBe(true);
      }
    }
  });

  it('содержит только тиры TOP и VIP (без NORMAL)', () => {
    const { plans } = service.getPlans();
    const types = new Set(plans.map((p) => p.type));
    expect(types).toEqual(new Set([PromotionType.TOP, PromotionType.VIP]));
  });

  it('возвращает согласованную ценовую матрицу в UZS', () => {
    const { plans } = service.getPlans();
    const price = (t: PromotionType, d: number) =>
      plans.find((p) => p.type === t && p.period_days === d)?.price;

    expect(price(PromotionType.TOP, 7)).toBe('50000.00');
    expect(price(PromotionType.TOP, 14)).toBe('90000.00');
    expect(price(PromotionType.TOP, 30)).toBe('150000.00');
    expect(price(PromotionType.VIP, 7)).toBe('120000.00');
    expect(price(PromotionType.VIP, 14)).toBe('210000.00');
    expect(price(PromotionType.VIP, 30)).toBe('350000.00');

    expect(plans.every((p) => p.currency === Currency.UZS)).toBe(true);
  });

  it('цены имеют Decimal-формат с двумя знаками', () => {
    const { plans } = service.getPlans();
    expect(plans.every((p) => /^\d+\.\d{2}$/.test(p.price))).toBe(true);
  });

  it('возврат иммутабелен — мутация результата не ломает каталог', () => {
    const first = service.getPlans();
    first.plans.pop();
    first.plans[0].price = 'mutated';

    const second = service.getPlans();
    expect(second.plans).toHaveLength(6);
    expect(second.plans.some((p) => p.price === 'mutated')).toBe(false);
  });
});
