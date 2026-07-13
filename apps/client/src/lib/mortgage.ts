/**
 * Ипотечный калькулятор — чистая математика (реплика мобильного приложения,
 * `lib/core/formatting/mortgage_estimate.dart`). Спецификация: docs/mortgage-calculator-web-spec.md.
 *
 * Только чистые функции и константы: ноль зависимостей, никаких сетевых вызовов.
 * Зарплата пользователя приватна и НИКОГДА не покидает устройство — здесь она
 * лишь аргумент расчёта DTI, наружу не уходит.
 *
 * Все суммы уже в валюте показа (UZS/USD) — сама формула валюто-независима.
 * Валюта участвует только в выборе дефолтной ставки ({@link defaultRateFor}) и
 * «красивом» округлении бюджета ({@link niceFloorPrice}).
 */
import type { Currency } from './mock/types';

/** Дефолтный первоначальный взнос, %. */
export const DOWN_PAYMENT_RATIO = 20;
/** Дефолтный срок кредита, лет. */
export const LOAN_TERM_YEARS = 20;
/** Дефолтная годовая ставка для расчёта в UZS, %. */
export const UZS_ANNUAL_RATE = 22;
/** Дефолтная годовая ставка для расчёта в USD, %. */
export const USD_ANNUAL_RATE = 8;
/** Лимит банка: платёж ≤ 40% зарплаты. */
export const DTI_LIMIT_PCT = 40;

/** Верхняя граница перебора срока в рекомендациях, лет. */
const MAX_TERM_YEARS = 30;
/** Верхняя граница перебора взноса в рекомендациях, %. */
const MAX_DOWN_PCT = 60;

/** Дефолтная годовая ставка по валюте показа: USD → 8%, UZS → 22%. */
export function defaultRateFor(currency: Currency): number {
  return currency === 'USD' ? USD_ANNUAL_RATE : UZS_ANNUAL_RATE;
}

/** Вход расчёта: все суммы — в валюте показа, ставка/взнос — в процентах. */
export interface MortgageInput {
  /** Цена объекта. */
  price: number;
  /** Зарплата в месяц (для DTI). */
  salary: number;
  /** Первоначальный взнос, %. */
  downPct: number;
  /** Годовая ставка, % (например, `8` = 8%). */
  annualRatePct: number;
  /** Срок кредита, лет. */
  years: number;
}

/** Результат расчёта (все суммы — в валюте входа). */
export interface MortgageResult {
  /** Первоначальный взнос. */
  downPayment: number;
  /** Тело кредита. */
  principal: number;
  /** Ежемесячный платёж (округлён до целой единицы валюты). */
  monthly: number;
  /** Всего выплат за срок (от округлённого `monthly`). */
  totalPaid: number;
  /** Переплата (проценты). */
  totalInterest: number;
  /** Доля платежа в зарплате, целый %. */
  dtiPct: number;
  /** Проходит ли по лимиту банка (`dtiPct <= 40`, нестрого). */
  affordable: boolean;
}

/**
 * Сырой аннуитетный платёж (без округления). `r === 0` → линейное деление
 * `principal / n` (ставка на слайдере недостижима, но функция обязана выдержать).
 */
function annuityMonthly(principal: number, annualRatePct: number, years: number): number {
  const n = years * 12;
  if (n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  const pow = Math.pow(1 + r, n);
  return (principal * (r * pow)) / (pow - 1);
}

/**
 * Аннуитетный расчёт по §3.1. Критичные правила округления:
 * `monthly` = round(сырой платёж); `totalPaid` = `monthly * n` (от УЖЕ
 * округлённого платежа); `dtiPct` — до целого %; `salary <= 0` → `dtiPct` 100.
 */
export function calculateMortgage(input: MortgageInput): MortgageResult {
  const { price, salary, downPct, annualRatePct, years } = input;
  const n = years * 12;
  const downPayment = (price * downPct) / 100;
  const principal = price - downPayment;
  const monthly = Math.round(annuityMonthly(principal, annualRatePct, years));
  const totalPaid = monthly * n;
  const totalInterest = totalPaid - principal;
  const dtiPct = salary <= 0 ? 100 : Math.round((monthly / salary) * 100);
  const affordable = dtiPct <= DTI_LIMIT_PCT;
  return { downPayment, principal, monthly, totalPaid, totalInterest, dtiPct, affordable };
}

/** Рекомендация «как сделать доступным» (§3.2). */
export type SuggestFix =
  /** Продлить срок до `years` лет. */
  | { type: 'term'; years: number; monthly: number; dtiPct: number }
  /** Увеличить взнос до `downPct`% — применяется вместе со сроком 30 лет. */
  | { type: 'downPayment'; downPct: number; years: number; monthly: number; dtiPct: number }
  /** Снизить бюджет до `maxPrice`. */
  | { type: 'budget'; maxPrice: number };

/**
 * Подобрать рекомендацию (вызывать только при `!affordable`). Строгий приоритет §3.2:
 * (1) продлить срок `years+1…30`; (2) иначе увеличить взнос `+5…60` НА СРОКЕ 30 лет
 * (кнопка применяет оба параметра); (3) иначе снизить бюджет через {@link maxAffordablePrice}.
 */
export function suggestFix(input: MortgageInput): SuggestFix {
  // 1. Продлить срок.
  for (let y = input.years + 1; y <= MAX_TERM_YEARS; y += 1) {
    const res = calculateMortgage({ ...input, years: y });
    if (res.dtiPct <= DTI_LIMIT_PCT) {
      return { type: 'term', years: y, monthly: res.monthly, dtiPct: res.dtiPct };
    }
  }
  // 2. Увеличить взнос — каждый вариант на сроке 30 лет.
  for (let d = input.downPct + 5; d <= MAX_DOWN_PCT; d += 5) {
    const res = calculateMortgage({ ...input, downPct: d, years: MAX_TERM_YEARS });
    if (res.dtiPct <= DTI_LIMIT_PCT) {
      return {
        type: 'downPayment',
        downPct: d,
        years: MAX_TERM_YEARS,
        monthly: res.monthly,
        dtiPct: res.dtiPct,
      };
    }
  }
  // 3. Снизить бюджет.
  return {
    type: 'budget',
    maxPrice: maxAffordablePrice(input.salary, input.downPct, input.annualRatePct),
  };
}

/**
 * Максимально доступная цена (§3.3): обратный аннуитет на 30-летнем сроке при
 * платеже ровно 40% зарплаты, с учётом доли кредита. `downPct` клампится в
 * `[0, 99]` (защита от деления на 0 при 100%). `r === 0` → линейный `budget * n`.
 */
export function maxAffordablePrice(salary: number, downPct: number, annualRatePct: number): number {
  const clampedDownPct = Math.min(99, Math.max(0, downPct));
  const budget = (salary * DTI_LIMIT_PCT) / 100;
  const n = MAX_TERM_YEARS * 12;
  const r = annualRatePct / 100 / 12;
  const principal =
    r === 0 ? budget * n : (budget * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n));
  return principal / (1 - clampedDownPct / 100);
}

/**
 * «Красивое» округление цены ВНИЗ перед подстановкой в фильтр поиска:
 * USD — до тысяч, UZS — до миллионов.
 */
export function niceFloorPrice(price: number, currency: Currency): number {
  const step = currency === 'USD' ? 1_000 : 1_000_000;
  return Math.floor(price / step) * step;
}
