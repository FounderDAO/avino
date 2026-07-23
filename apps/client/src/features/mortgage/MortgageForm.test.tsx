/**
 * MortgageForm — тесты (спека §4).
 *
 * Оборачиваем в реальный Redux-store (makeStore, как mortgageSlice.test.ts) —
 * персистентность/дефолты слайса проверять не нужно, важно поведение формы.
 * `exchangeRateApi` замокан (валюта листинга/показа совпадают — USD, курс не
 * нужен), next-intl — key-резолвер с интерполяцией (как PropertyCard.test.tsx).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore } from '@/store/store';
import type { Listing } from '@/lib/mock/types';

const push = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string, vars?: Record<string, unknown>) => {
    const base = ns ? `${ns}.${key}` : key;
    return vars ? `${base}:${JSON.stringify(vars)}` : base;
  },
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/store/api/exchangeRateApi', () => ({
  useGetExchangeRateQuery: () => ({ data: undefined, isLoading: false }),
}));

// Импорт ПОСЛЕ моков
import { MortgageForm } from './MortgageForm';
import { setDownPct } from '@/store/slices/mortgageSlice';

const listing: Listing = {
  id: 'l1',
  tx: 'SALE',
  type: 'APARTMENT',
  promo: 'NORMAL',
  price: '200000',
  currency: 'USD',
  rooms: 3,
  title: 'Квартира в центре',
  district: 'Юнусабад',
  address: 'ул. Амира Темура, 1',
  photos: [],
  agent: { name: 'Ali', pro: false, agency: 'Частный собственник', kind: 'owner' },
  createdAt: new Date().toISOString(),
};

function renderForm(store = makeStore()) {
  return render(
    <Provider store={store}>
      <MortgageForm listing={listing} />
    </Provider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  push.mockReset();
});

describe('MortgageForm', () => {
  it('живая группировка тысяч при вводе зарплаты', () => {
    renderForm();
    const input = screen.getByLabelText('mortgage.salaryLabel') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1400' } });
    expect(input.value).toBe('1,400');
  });

  it('CTA задизейблена при пустой зарплате, активна после ввода', () => {
    renderForm();
    const cta = screen.getByRole('button', { name: 'mortgage.cta' });
    expect(cta).toBeDisabled();

    const input = screen.getByLabelText('mortgage.salaryLabel');
    fireEvent.change(input, { target: { value: '3000' } });
    expect(cta).not.toBeDisabled();
  });

  it('клик по CTA ведёт на экран результата', () => {
    renderForm();
    const input = screen.getByLabelText('mortgage.salaryLabel');
    fireEvent.change(input, { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: 'mortgage.cta' }));
    expect(push).toHaveBeenCalledWith('/listing/l1/mortgage/result');
  });

  it('чип взноса подсвечен только при точном совпадении (45% → ни один)', () => {
    // 45% недостижим чипами — приходит из applyFix; store с SSR-safe
    // initialState гидрируется MortgageHydrator'ом, в тесте — прямым action.
    const store = makeStore();
    store.dispatch(setDownPct(45));
    renderForm(store);
    for (const pct of [15, 20, 30, 40]) {
      const chip = screen.getByRole('button', { name: `${pct}%` });
      expect(chip.className).not.toMatch(/bg-ink/);
    }
  });

  it('чип 20% подсвечен по дефолту (downPct=20)', () => {
    renderForm();
    const chip = screen.getByRole('button', { name: '20%' });
    expect(chip.className).toMatch(/bg-ink/);
  });
});
