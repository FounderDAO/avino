/**
 * Тесты SellPromoCards: живые цены тарифов из GET /promotions/plans.
 *
 * Мокируем next-intl (t → 'ns.key' + значения параметров через пробел)
 * и useGetPromotionPlansQuery. Проверяем: минимальная цена по типу из API
 * и статичный фолбэк словаря, пока данных нет.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellPromoCards } from './SellPromoCards';
import type { PromotionPlan } from '@/store/api/promotionsApi';

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, string>) => {
    const full = ns ? `${ns}.${key}` : key;
    return params ? `${full} ${Object.values(params).join(' ')}` : full;
  },
}));

const mockQuery = vi.fn<() => { data?: PromotionPlan[] }>();
vi.mock('@/store/api/promotionsApi', () => ({
  useGetPromotionPlansQuery: () => mockQuery(),
}));

beforeEach(() => {
  mockQuery.mockReset();
});

describe('SellPromoCards', () => {
  it('показывает минимальную цену каждого типа из API', () => {
    mockQuery.mockReturnValue({
      data: [
        { type: 'TOP', period_days: 7, price: '55000.00', currency: 'UZS' },
        { type: 'TOP', period_days: 30, price: '150000.00', currency: 'UZS' },
        { type: 'VIP', period_days: 7, price: '130000.00', currency: 'UZS' },
      ],
    });
    render(<SellPromoCards />);
    // formatMoney: «55,000 units.sum»; шаблон promo.priceFrom получает цену параметром.
    expect(screen.getByText('sell.promo.priceFrom 55,000 units.sum')).toBeInTheDocument();
    expect(screen.getByText('sell.promo.priceFrom 130,000 units.sum')).toBeInTheDocument();
  });

  it('фолбэк на статичный словарь, пока данных нет или каталог пуст', () => {
    mockQuery.mockReturnValue({ data: undefined });
    const { unmount } = render(<SellPromoCards />);
    expect(screen.getByText('sell.promo.top.price')).toBeInTheDocument();
    expect(screen.getByText('sell.promo.vip.price')).toBeInTheDocument();
    unmount();

    mockQuery.mockReturnValue({ data: [] });
    render(<SellPromoCards />);
    expect(screen.getByText('sell.promo.top.price')).toBeInTheDocument();
    expect(screen.getByText('sell.promo.vip.price')).toBeInTheDocument();
  });

  it('цена в USD форматируется со знаком доллара', () => {
    mockQuery.mockReturnValue({
      data: [{ type: 'TOP', period_days: 7, price: '5.00', currency: 'USD' }],
    });
    render(<SellPromoCards />);
    expect(screen.getByText('sell.promo.priceFrom $5')).toBeInTheDocument();
  });
});
