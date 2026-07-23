/**
 * useMortgage — связывает mortgageSlice, предпочтение валюты и курс ЦБУ
 * во вход чистой математики `lib/mortgage.ts`. Единственная точка сборки:
 * экраны калькулятора и виджеты на detail считают через эти хуки.
 *
 * Зарплата приватна: живёт только в Redux/localStorage, в API не уходит
 * (курс валют — единственный сетевой запрос, и он без параметров).
 */
'use client';

import { useAppSelector } from '../store/hooks';
import { selectMortgageParams } from '../store/slices/mortgageSlice';
import { useCurrencyPreference } from './useCurrencyPreference';
import { useGetExchangeRateQuery } from '../store/api/exchangeRateApi';
import { convertPrice } from './format';
import { calculateMortgage, type MortgageResult } from './mortgage';
import type { Currency, Listing } from './mock/types';

/** Зарплата в валюте показа: конверсия по курсу с округлением до целого.
 *  Сохранена в другой валюте, а курса нет → null (не показываем число «в чужой валюте»). */
export function salaryInDisplay(
  salary: number | null,
  salaryCurrency: Currency | null,
  display: Currency,
  rate: number | undefined,
): number | null {
  if (salary == null || salary <= 0) return null;
  if (salaryCurrency == null || salaryCurrency === display) return salary;
  if (!rate || rate <= 0) return null;
  return Math.round(convertPrice(salary, salaryCurrency, display, rate));
}

/** Структура первого платежа аннуитета (§6.2 спеки): проценты на весь кредит,
 *  остаток платежа гасит тело. */
export function firstPaymentBreakdown(
  principal: number,
  annualRatePct: number,
  monthly: number,
): { interest: number; principalPart: number } {
  const interest = Math.round((principal * annualRatePct) / 100 / 12);
  return { interest, principalPart: monthly - interest };
}

export interface MortgageParams {
  /** Валюта показа — она же валюта всех расчётов. */
  display: Currency;
  /** Курс 1 USD = rate UZS (undefined, пока не загружен). */
  rate: number | undefined;
  /** Зарплата в валюте показа (null — не введена или не конвертируема без курса). */
  salary: number | null;
  /** true — зарплата сохранена в другой валюте, а курс ещё грузится (показать спиннер, не фолбэк). */
  salaryPending: boolean;
  downPct: number;
  /** Ставка для валюты показа (хранятся раздельно для USD/UZS). */
  ratePct: number;
  years: number;
}

/** Параметры калькулятора, приведённые к валюте показа. */
export function useMortgageParams(): MortgageParams {
  const display = useCurrencyPreference();
  const { data, isLoading } = useGetExchangeRateQuery();
  const rate = data ? Number(data.rate) : undefined;
  const s = useAppSelector(selectMortgageParams);

  const salary = salaryInDisplay(s.salary, s.salaryCurrency, display, rate);
  const salaryPending =
    s.salary != null && s.salaryCurrency != null && s.salaryCurrency !== display && isLoading;

  return {
    display,
    rate,
    salary,
    salaryPending,
    downPct: s.downPct,
    ratePct: display === 'USD' ? s.ratePctUsd : s.ratePctUzs,
    years: s.years,
  };
}

export interface ListingMortgage extends MortgageParams {
  /** Цена объявления в валюте показа (целые единицы). */
  price: number | null;
  /** Полный расчёт (salary=0, если зарплата не введена — dti тогда не осмыслен). */
  result: MortgageResult | null;
  firstPayment: { interest: number; principalPart: number } | null;
}

/** Оценка ипотеки для конкретного объявления (est-полоска, карточка платежа, экраны). */
export function useListingMortgage(
  listing: Pick<Listing, 'price' | 'currency'> | null,
): ListingMortgage {
  const params = useMortgageParams();
  const { display, rate, salary, downPct, ratePct, years } = params;

  let price: number | null = null;
  if (listing) {
    const native = Number(listing.price);
    if (listing.currency === display) price = native;
    else if (rate && rate > 0) price = Math.round(convertPrice(native, listing.currency, display, rate));
  }

  const result =
    price != null
      ? calculateMortgage({ price, salary: salary ?? 0, downPct, annualRatePct: ratePct, years })
      : null;
  const firstPayment = result ? firstPaymentBreakdown(result.principal, ratePct, result.monthly) : null;

  return { ...params, price, result, firstPayment };
}
