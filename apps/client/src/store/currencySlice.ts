/**
 * Предпочтение отображаемой валюты (UZS / USD) с синхронизацией в localStorage.
 *
 * SSR-safe: при инициализации reducer'а localStorage НЕ читается (на сервере
 * его нет). Гидратация выполняется на клиенте через `hydrateCurrency()` —
 * см. CurrencyHydrator в StoreProvider. Изменение через setCurrency сразу
 * пишется в localStorage (только на клиенте).
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type DisplayCurrency = 'UZS' | 'USD';
const STORAGE_KEY = 'avino.displayCurrency';

/** Чтение предпочтения валюты из localStorage (только на клиенте). */
export function readCurrencyFromStorage(): DisplayCurrency {
  if (typeof window === 'undefined') return 'USD';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'UZS' ? 'UZS' : 'USD';
  } catch {
    return 'USD';
  }
}

/** Запись предпочтения валюты в localStorage (только на клиенте). */
function persist(value: DisplayCurrency): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* приватный режим / переполнение — игнорируем */
  }
}

interface CurrencyState {
  displayCurrency: DisplayCurrency;
}
const initialState: CurrencyState = { displayCurrency: 'USD' };

const currencySlice = createSlice({
  name: 'currency',
  initialState,
  reducers: {
    /** Установить валюту из localStorage при гидратации (без записи обратно). */
    hydrateCurrency(state, action: PayloadAction<DisplayCurrency>) {
      state.displayCurrency = action.payload;
    },
    /** Переключить отображаемую валюту и сохранить в localStorage. */
    setCurrency(state, action: PayloadAction<DisplayCurrency>) {
      state.displayCurrency = action.payload;
      persist(action.payload);
    },
  },
});

export const { hydrateCurrency, setCurrency } = currencySlice.actions;
export default currencySlice.reducer;
