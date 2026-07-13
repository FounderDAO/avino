import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DOWN_PAYMENT_RATIO, LOAN_TERM_YEARS, defaultRateFor } from '@/lib/mortgage';

/**
 * mortgageSlice — параметры ипотечного калькулятора публичного портала.
 *
 * Математика расчёта (аннуитет, DTI, рекомендации) — в `@/lib/mortgage`, этот
 * слайс хранит только пользовательский ввод формы. Зарплата **никогда не
 * покидает устройство** — расчёт целиком на клиенте, в API не отправляется
 * (см. docs/mortgage-calculator-web-spec.md §1, §4.4).
 *
 * Персистентность в localStorage — ключи совместимы по неймингу с мобильным
 * приложением (Flutter, `mortgage_prefs_store.dart`), см. спеку §4.4:
 * - `mortgage_salary` / `mortgage_salary_currency` — зарплата и валюта, в
 *   которой она была введена. Очистка поля удаляет ОБА ключа разом.
 * - `mortgage_down_pct` — первоначальный взнос, %.
 * - `mortgage_rate_pct_usd` / `mortgage_rate_pct_uzs` — годовая ставка
 *   хранится ОТДЕЛЬНО для каждой валюты показа (у UZS и USD разные рыночные
 *   ставки); смена ставки в одной валюте не трогает сохранённую для другой.
 * - `mortgage_years` — срок кредита, лет.
 *
 * SSR-safe (как в currencySlice.ts): initialState — статические дефолты,
 * localStorage читается ТОЛЬКО на клиенте через `hydrateMortgage()` —
 * MortgageHydrator в StoreProvider диспатчит его после монтирования. Иначе
 * SSR-разметка (дефолты) не совпадает с первым клиентским рендером
 * (LS-значения) → hydration mismatch. Смена локали ремонтирует
 * [locale]/layout → StoreProvider пересоздаёт store и гидрирует заново,
 * поэтому введённые параметры переживают переключение языка (#386).
 */

export type MortgageCurrency = 'USD' | 'UZS';

const SALARY_KEY = 'mortgage_salary';
const SALARY_CURRENCY_KEY = 'mortgage_salary_currency';
const DOWN_PCT_KEY = 'mortgage_down_pct';
const RATE_PCT_USD_KEY = 'mortgage_rate_pct_usd';
const RATE_PCT_UZS_KEY = 'mortgage_rate_pct_uzs';
const YEARS_KEY = 'mortgage_years';

const DEFAULT_DOWN_PCT = DOWN_PAYMENT_RATIO;
const DEFAULT_YEARS = LOAN_TERM_YEARS;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readStored(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function persist(key: string, value: string | null): void {
  if (!isBrowser()) return;
  try {
    if (value !== null) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* приватный режим / отключённый storage — игнорируем */
  }
}

/** Читает число из localStorage; отсутствующее/пустое/битое значение → null. */
function readNumber(key: string): number | null {
  const raw = readStored(key);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readCurrency(): MortgageCurrency | null {
  const raw = readStored(SALARY_CURRENCY_KEY);
  return raw === 'USD' || raw === 'UZS' ? raw : null;
}

export interface MortgageState {
  salary: number | null;
  salaryCurrency: MortgageCurrency | null;
  downPct: number;
  ratePctUsd: number;
  ratePctUzs: number;
  years: number;
}

/** Статические дефолты — одинаковы на сервере и в первом клиентском рендере. */
const initialState: MortgageState = {
  salary: null,
  salaryCurrency: null,
  downPct: DEFAULT_DOWN_PCT,
  ratePctUsd: defaultRateFor('USD'),
  ratePctUzs: defaultRateFor('UZS'),
  years: DEFAULT_YEARS,
};

/**
 * Чтение сохранённых параметров из localStorage (только на клиенте).
 * Используется MortgageHydrator'ом в StoreProvider — см. doc-комментарий выше.
 */
export function readMortgageFromStorage(): MortgageState {
  const salary = readNumber(SALARY_KEY);
  const salaryCurrency = readCurrency();
  const downPct = readNumber(DOWN_PCT_KEY);
  const ratePctUsd = readNumber(RATE_PCT_USD_KEY);
  const ratePctUzs = readNumber(RATE_PCT_UZS_KEY);
  const years = readNumber(YEARS_KEY);
  // Зарплата валидна только вместе со своей валютой — иначе конвертировать
  // её на экране формы не получится (спека §4.4).
  const hasSalary = salary !== null && salary > 0 && salaryCurrency !== null;
  return {
    salary: hasSalary ? salary : null,
    salaryCurrency: hasSalary ? salaryCurrency : null,
    downPct: downPct ?? DEFAULT_DOWN_PCT,
    ratePctUsd: ratePctUsd ?? defaultRateFor('USD'),
    ratePctUzs: ratePctUzs ?? defaultRateFor('UZS'),
    years: years ?? DEFAULT_YEARS,
  };
}

const mortgageSlice = createSlice({
  name: 'mortgage',
  initialState,
  reducers: {
    /** Установить параметры из localStorage при гидратации (без записи обратно). */
    hydrateMortgage(_state, action: PayloadAction<MortgageState>) {
      return action.payload;
    },

    /**
     * Зарплата + валюта, в которой она введена. `value <= 0` или `null`
     * трактуется как очистка поля — удаляем ОБА ключа localStorage.
     */
    setSalary(
      state,
      action: PayloadAction<{ value: number | null; currency: MortgageCurrency }>,
    ) {
      const { value, currency } = action.payload;
      if (value === null || value <= 0) {
        state.salary = null;
        state.salaryCurrency = null;
        persist(SALARY_KEY, null);
        persist(SALARY_CURRENCY_KEY, null);
        return;
      }
      state.salary = value;
      state.salaryCurrency = currency;
      persist(SALARY_KEY, String(value));
      persist(SALARY_CURRENCY_KEY, currency);
    },

    /** Первоначальный взнос, %. */
    setDownPct(state, action: PayloadAction<number>) {
      state.downPct = action.payload;
      persist(DOWN_PCT_KEY, String(action.payload));
    },

    /**
     * Годовая ставка. Пишет ТОЛЬКО ключ своей валюты — ставки USD/UZS
     * хранятся независимо (спека §4.4).
     */
    setRatePct(
      state,
      action: PayloadAction<{ currency: MortgageCurrency; value: number }>,
    ) {
      const { currency, value } = action.payload;
      if (currency === 'USD') {
        state.ratePctUsd = value;
        persist(RATE_PCT_USD_KEY, String(value));
      } else {
        state.ratePctUzs = value;
        persist(RATE_PCT_UZS_KEY, String(value));
      }
    },

    /** Срок кредита, лет. */
    setYears(state, action: PayloadAction<number>) {
      state.years = action.payload;
      persist(YEARS_KEY, String(action.payload));
    },

    /**
     * Атомарно применяет рекомендацию «как сделать доступным» (спека §3.2):
     * кнопка «взнос {d}%» ставит и взнос, и years=30 одним action.
     */
    applyFix(state, action: PayloadAction<{ downPct?: number; years?: number }>) {
      const { downPct, years } = action.payload;
      if (downPct !== undefined) {
        state.downPct = downPct;
        persist(DOWN_PCT_KEY, String(downPct));
      }
      if (years !== undefined) {
        state.years = years;
        persist(YEARS_KEY, String(years));
      }
    },
  },
});

export const { hydrateMortgage, setSalary, setDownPct, setRatePct, setYears, applyFix } =
  mortgageSlice.actions;

export const mortgageReducer = mortgageSlice.reducer;

// ─── Селекторы ──────────────────────────────────────────────────────────────
// Типизированы по минимальной форме { mortgage }, чтобы избежать цикла
// импорта с store.ts (см. authSlice.ts).

type MortgageSliceRoot = { mortgage: MortgageState };

export const selectMortgageParams = (s: MortgageSliceRoot) => s.mortgage;

/** Сохранённая ставка для указанной валюты показа. */
export const rateFor = (s: MortgageSliceRoot, currency: MortgageCurrency): number =>
  currency === 'USD' ? s.mortgage.ratePctUsd : s.mortgage.ratePctUzs;
