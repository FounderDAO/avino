/**
 * MortgageEstBar — тесты (спека §6.1).
 * Продажа с загруженной ценой → полоска с округлённым платежом и ссылкой на
 * калькулятор; аренда → null; курс ещё не загружен (price=null) → null, без NaN.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MortgageEstBar } from './MortgageEstBar';

const MORTGAGE: Record<string, string> = {
  estMonthly: 'Ипотека ≈ {monthly}/мес',
  estCta: 'Рассчитать ипотеку',
};
const UNITS: Record<string, string> = {
  sum: 'сум',
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

describe('MortgageEstBar', () => {
  it('продажа + загруженная цена → полоска с платежом и CTA', () => {
    mockUseListingMortgage.mockReturnValue({
      display: 'USD',
      price: 100000,
      result: { monthly: 460, downPayment: 20000, principal: 80000, totalPaid: 1, totalInterest: 1, dtiPct: 0, affordable: true },
    });

    render(<MortgageEstBar listing={listing} />);

    expect(screen.getByText(/\$460/)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Рассчитать ипотеку' });
    expect(cta).toHaveAttribute('href', '/listing/l1/mortgage');
  });

  it('аренда → ничего не рендерит', () => {
    mockUseListingMortgage.mockReturnValue({
      display: 'USD',
      price: 100000,
      result: { monthly: 460 },
    });

    const { container } = render(<MortgageEstBar listing={{ ...listing, tx: 'RENT' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('курс ещё не загружен (price=null) → null, без NaN', () => {
    mockUseListingMortgage.mockReturnValue({ display: 'USD', price: null, result: null });

    const { container } = render(<MortgageEstBar listing={listing} />);
    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).not.toMatch(/NaN/);
  });
});
