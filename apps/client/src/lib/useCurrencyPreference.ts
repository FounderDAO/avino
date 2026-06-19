import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setCurrency, type DisplayCurrency } from '../store/currencySlice';

/** Возвращает текущее предпочтение отображаемой валюты ('UZS' | 'USD'). */
export function useCurrencyPreference(): DisplayCurrency {
  return useAppSelector((s) => s.currency.displayCurrency);
}

/** Возвращает коллбэк для смены отображаемой валюты (с persist в localStorage). */
export function useSetCurrency(): (c: DisplayCurrency) => void {
  const dispatch = useAppDispatch();
  return (c) => dispatch(setCurrency(c));
}
