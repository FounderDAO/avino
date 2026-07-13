/**
 * MortgagePaymentCard — тесты (спека §6.2).
 * Продажа с загруженным расчётом → платёж + параметры + stacked bar с долями
 * proportional interest/principalPart; аренда → null; курс не загружен
 * (price=null) → null, без NaN.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MortgagePaymentCard } from './MortgagePaymentCard';

const MORTGAGE: Record<string, string> = {
  cardEstimateLabel: 'Оценка',
  cardTitle: 'Ежемесячный платёж',
  cardParams: '{downPct}% взнос · {rate}% годовых · {years}',
  firstPaymentTitle: 'Структура первого платежа',
  legendInterest: 'Проценты',
  legendPrincipal: 'Тело кредита',
  cardCta: 'Настроить расчёт',
  yearsValue: '{count} лет',
};
const UNITS: Record<string, string> = {
  sum: 'сум',
  perMonth: '/мес',
};

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) => {
    const dict = ns === 'mortgage' ? MORTGAGE : UNITS;
    let str = dict[key] ?? `${ns}.${key}`;
    if (values) {
      for (const [k, v] of Object.entries(values)) str = str.replaceAll(`{${k}}`, String(v));
    }
    return str;
  },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockUseListingMortgage = vi.fn();
vi.mock('@/lib/useMortgage', () => ({
  useListingMortgage: (...args: unknown[]) => mockUseListingMortgage(...args),
}));

const listing = { id: 'l1', price: '100000', currency: 'USD' as const, tx: 'SALE' as const };

describe('MortgagePaymentCard', () => {
  it('продажа + расчёт → платёж, параметры, разбивка первого платежа с долями', () => {
    // monthly=460, interest=300, principalPart=160 → доли 65.2% / 34.8%.
    mockUseListingMortgage.mockReturnValue({
      display: 'USD',
      price: 100000,
      result: { monthly: 460, downPayment: 20000, principal: 80000, totalPaid: 1, totalInterest: 1, dtiPct: 0, affordable: true },
      firstPayment: { interest: 300, principalPart: 160 },
      downPct: 20,
      ratePct: 8,
      years: 20,
    });

    const { container } = render(<MortgagePaymentCard listing={listing} />);

    expect(screen.getByText(/\$460/)).toBeInTheDocument();
    expect(screen.getByText('20% взнос · 8% годовых · 20 лет')).toBeInTheDocument();

    const bars = container.querySelectorAll('[style*="width"]');
    expect(bars).toHaveLength(2);
    expect((bars[0] as HTMLElement).style.width).toBe('65.21739130434783%');
    expect((bars[1] as HTMLElement).style.width).toBe('34.78260869565217%');

    const cta = screen.getByRole('link', { name: 'Настроить расчёт' });
    expect(cta).toHaveAttribute('href', '/listing/l1/mortgage');
  });

  it('дробная ставка → «8.5%», не «8.50%»', () => {
    mockUseListingMortgage.mockReturnValue({
      display: 'USD',
      price: 100000,
      result: { monthly: 460 },
      firstPayment: { interest: 300, principalPart: 160 },
      downPct: 20,
      ratePct: 8.5,
      years: 20,
    });

    render(<MortgagePaymentCard listing={listing} />);
    expect(screen.getByText('20% взнос · 8.5% годовых · 20 лет')).toBeInTheDocument();
  });

  it('аренда → ничего не рендерит', () => {
    mockUseListingMortgage.mockReturnValue({
      display: 'USD',
      price: 100000,
      result: { monthly: 460 },
      firstPayment: { interest: 300, principalPart: 160 },
    });

    const { container } = render(<MortgagePaymentCard listing={{ ...listing, tx: 'RENT' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('курс ещё не загружен (price=null) → null, без NaN', () => {
    mockUseListingMortgage.mockReturnValue({
      display: 'USD',
      price: null,
      result: null,
      firstPayment: null,
    });

    const { container } = render(<MortgagePaymentCard listing={listing} />);
    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).not.toMatch(/NaN/);
  });
});
