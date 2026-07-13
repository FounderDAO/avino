/**
 * MortgageResult — тесты (спека §5).
 *
 * Числа фикстур подобраны реальными формулами `@/lib/mortgage` (см.
 * doc-комментарии в тестах), чтобы не завязываться на константы мока.
 * Store — реальный (makeStore), рекомендации проверяем по итоговому
 * состоянию store после клика (сильнее, чем просто проверка вызова dispatch).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from '@/store/store';
import type { Listing } from '@/lib/mock/types';

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string, vars?: Record<string, unknown>) => {
    const base = ns ? `${ns}.${key}` : key;
    return vars ? `${base}:${JSON.stringify(vars)}` : base;
  },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/store/api/exchangeRateApi', () => ({
  useGetExchangeRateQuery: () => ({ data: undefined, isLoading: false }),
}));

// Импорт ПОСЛЕ моков
import { MortgageResult } from './MortgageResult';
import { setSalary, setYears } from '@/store/slices/mortgageSlice';

function makeListing(price: string): Listing {
  return {
    id: 'l1',
    tx: 'SALE',
    type: 'APARTMENT',
    promo: 'NORMAL',
    price,
    currency: 'USD',
    rooms: 3,
    title: 'Квартира в центре',
    district: 'Юнусабад',
    address: 'ул. Амира Темура, 1',
    photos: [],
    agent: { name: 'Ali', pro: false, agency: 'Частный собственник', kind: 'owner' },
    createdAt: new Date().toISOString(),
  };
}

function renderResult(listing: Listing, store: AppStore = makeStore()): AppStore {
  render(
    <Provider store={store}>
      <MortgageResult listing={listing} />
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('MortgageResult', () => {
  // price=200000, downPct=20 (дефолт), rate=8% USD (дефолт), years=20 (дефолт)
  // → monthly=1338; salary=3345 → dtiPct ровно 40 (calculateMortgage, `Math.round`).
  it('DTI ровно 40% → вердикт OK (граница нестрогая)', () => {
    // Store с SSR-safe initialState: параметры задаются action'ами
    // (в приложении их диспатчит MortgageHydrator из localStorage).
    const store = makeStore();
    store.dispatch(setSalary({ value: 3345, currency: 'USD' }));
    renderResult(makeListing('200000'), store);

    expect(screen.getByText('mortgage.verdictOk')).toBeInTheDocument();
    expect(screen.queryByText('mortgage.verdictNo')).not.toBeInTheDocument();
    // Значение DTI (40%) и подпись лимита-черты (40%) — оба на экране.
    expect(screen.getAllByText('40%')).toHaveLength(2);
  });

  // price=200000, salary=2500, years=30 (макс. срок — этап 1 suggestFix
  // пропускается сразу), downPct=20 (дефолт) → не проходит; на 30 годах
  // первый подходящий взнос — 35% (monthly=954, dti=38).
  it('рекомендация «увеличить взнос» диспатчит downPct И years=30 одновременно', () => {
    const store = makeStore();
    store.dispatch(setSalary({ value: 2500, currency: 'USD' }));
    store.dispatch(setYears(30));
    renderResult(makeListing('200000'), store);

    expect(screen.getByText('mortgage.verdictNo')).toBeInTheDocument();
    const fixButton = screen.getByRole('button', {
      name: /mortgage.fixDownCta/,
    });
    fireEvent.click(fixButton);

    const state = store.getState().mortgage;
    expect(state.downPct).toBe(35);
    expect(state.years).toBe(30);
  });

  it('без сохранённой зарплаты — сообщение noSalary и ссылка на форму', () => {
    renderResult(makeListing('200000'));
    expect(screen.getByText('mortgage.noSalary')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mortgage.recalc' })).toHaveAttribute(
      'href',
      '/listing/l1/mortgage',
    );
  });
});
