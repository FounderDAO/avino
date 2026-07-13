/**
 * mortgageSlice — гидрация из localStorage при пересоздании store, плюс
 * персистентность каждого reducer'а.
 *
 * `@/lib/mortgage` замокан константами по спеке (docs/mortgage-calculator-web-spec.md
 * §2), чтобы тест слайса не зависел от параллельной реализации математики
 * калькулятора (файл на момент написания теста мог ещё не существовать).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/mortgage', () => ({
  DOWN_PAYMENT_RATIO: 20,
  LOAN_TERM_YEARS: 20,
  defaultRateFor: (currency: 'USD' | 'UZS') => (currency === 'USD' ? 8 : 22),
}));

import { makeStore } from '../store';
import {
  applyFix,
  hydrateMortgage,
  rateFor,
  readMortgageFromStorage,
  selectMortgageParams,
  setDownPct,
  setRatePct,
  setSalary,
  setYears,
} from './mortgageSlice';

describe('mortgageSlice: дефолты', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('initialState — дефолты из спеки (SSR-safe: без чтения localStorage)', () => {
    window.localStorage.setItem('mortgage_down_pct', '40');
    const store = makeStore();
    // До hydrateMortgage store игнорирует localStorage — SSR и первый
    // клиентский рендер обязаны совпадать (см. StoreProvider).
    expect(selectMortgageParams(store.getState())).toEqual({
      salary: null,
      salaryCurrency: null,
      downPct: 20,
      ratePctUsd: 8,
      ratePctUzs: 22,
      years: 20,
    });
  });

  it('пустой localStorage → readMortgageFromStorage даёт дефолты', () => {
    expect(readMortgageFromStorage()).toEqual({
      salary: null,
      salaryCurrency: null,
      downPct: 20,
      ratePctUsd: 8,
      ratePctUzs: 22,
      years: 20,
    });
  });

  it('битые значения в localStorage → дефолты', () => {
    window.localStorage.setItem('mortgage_salary', 'not-a-number');
    window.localStorage.setItem('mortgage_salary_currency', 'EUR');
    window.localStorage.setItem('mortgage_down_pct', 'NaN');
    window.localStorage.setItem('mortgage_rate_pct_usd', 'garbage');
    window.localStorage.setItem('mortgage_rate_pct_uzs', '');
    window.localStorage.setItem('mortgage_years', 'garbage');

    expect(readMortgageFromStorage()).toEqual({
      salary: null,
      salaryCurrency: null,
      downPct: 20,
      ratePctUsd: 8,
      ratePctUzs: 22,
      years: 20,
    });
  });
});

describe('mortgageSlice: гидрация переживает пересоздание store (ремонт при смене локали)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('сохранённые значения подхватываются новым store после hydrateMortgage', () => {
    const store1 = makeStore();
    store1.dispatch(setSalary({ value: 1400, currency: 'USD' }));
    store1.dispatch(setDownPct(30));
    store1.dispatch(setRatePct({ currency: 'USD', value: 9.5 }));
    store1.dispatch(setRatePct({ currency: 'UZS', value: 24 }));
    store1.dispatch(setYears(25));

    // Смена локали: StoreProvider пересоздаёт store и MortgageHydrator
    // диспатчит hydrateMortgage(readMortgageFromStorage()).
    const store2 = makeStore();
    store2.dispatch(hydrateMortgage(readMortgageFromStorage()));
    expect(selectMortgageParams(store2.getState())).toEqual({
      salary: 1400,
      salaryCurrency: 'USD',
      downPct: 30,
      ratePctUsd: 9.5,
      ratePctUzs: 24,
      years: 25,
    });
  });
});

describe('mortgageSlice: setSalary', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('записывает зарплату и валюту в localStorage', () => {
    const store = makeStore();
    store.dispatch(setSalary({ value: 2000, currency: 'UZS' }));
    expect(window.localStorage.getItem('mortgage_salary')).toBe('2000');
    expect(window.localStorage.getItem('mortgage_salary_currency')).toBe('UZS');
  });

  it('value=null удаляет оба ключа и сбрасывает state', () => {
    const store = makeStore();
    store.dispatch(setSalary({ value: 2000, currency: 'UZS' }));
    store.dispatch(setSalary({ value: null, currency: 'UZS' }));

    expect(selectMortgageParams(store.getState()).salary).toBeNull();
    expect(selectMortgageParams(store.getState()).salaryCurrency).toBeNull();
    expect(window.localStorage.getItem('mortgage_salary')).toBeNull();
    expect(window.localStorage.getItem('mortgage_salary_currency')).toBeNull();
  });

  it('value<=0 трактуется как очистка', () => {
    const store = makeStore();
    store.dispatch(setSalary({ value: 2000, currency: 'UZS' }));
    store.dispatch(setSalary({ value: 0, currency: 'UZS' }));

    expect(selectMortgageParams(store.getState()).salary).toBeNull();
    expect(window.localStorage.getItem('mortgage_salary')).toBeNull();
    expect(window.localStorage.getItem('mortgage_salary_currency')).toBeNull();
  });
});

describe('mortgageSlice: setRatePct — независимое хранение USD/UZS', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('смена USD-ставки не трогает сохранённую UZS-ставку', () => {
    const store = makeStore();
    store.dispatch(setRatePct({ currency: 'UZS', value: 21 }));
    store.dispatch(setRatePct({ currency: 'USD', value: 7.5 }));

    expect(window.localStorage.getItem('mortgage_rate_pct_uzs')).toBe('21');
    expect(window.localStorage.getItem('mortgage_rate_pct_usd')).toBe('7.5');
    expect(rateFor(store.getState(), 'USD')).toBe(7.5);
    expect(rateFor(store.getState(), 'UZS')).toBe(21);
  });

  it('смена UZS-ставки не трогает сохранённую USD-ставку', () => {
    const store = makeStore();
    store.dispatch(setRatePct({ currency: 'USD', value: 6 }));
    store.dispatch(setRatePct({ currency: 'UZS', value: 25 }));

    expect(window.localStorage.getItem('mortgage_rate_pct_usd')).toBe('6');
    expect(rateFor(store.getState(), 'USD')).toBe(6);
    expect(rateFor(store.getState(), 'UZS')).toBe(25);
  });
});

describe('mortgageSlice: applyFix', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('атомарно применяет downPct и years, персистит оба (рекомендация «взнос d%»)', () => {
    const store = makeStore();
    store.dispatch(applyFix({ downPct: 45, years: 30 }));

    expect(selectMortgageParams(store.getState()).downPct).toBe(45);
    expect(selectMortgageParams(store.getState()).years).toBe(30);
    expect(window.localStorage.getItem('mortgage_down_pct')).toBe('45');
    expect(window.localStorage.getItem('mortgage_years')).toBe('30');
  });

  it('применяет только years, не трогая downPct (рекомендация «срок y лет»)', () => {
    const store = makeStore();
    store.dispatch(setDownPct(20));
    store.dispatch(applyFix({ years: 28 }));

    expect(selectMortgageParams(store.getState()).downPct).toBe(20);
    expect(selectMortgageParams(store.getState()).years).toBe(28);
  });
});
