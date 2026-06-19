/**
 * usePriceFormatter — хук объединяющий валютные предпочтения пользователя
 * с курсом и форматтером цены. Читает `useCurrencyPreference`, `useGetExchangeRateQuery`
 * и возвращает { display, price(listing, opts?), pin(listing) }.
 *
 * Используется в PropertyCard, MyListings, MapView (через fmt.pin → pinHTML).
 */
import { useTranslations } from 'next-intl';
import type { Listing } from './mock/types';
import { formatPrice, pinPrice, type FormatPriceOptions } from './format';
import { useCurrencyPreference } from './useCurrencyPreference';
import { useGetExchangeRateQuery } from '../store/api/exchangeRateApi';

export function usePriceFormatter() {
  const t = useTranslations('units');
  const display = useCurrencyPreference();
  const { data } = useGetExchangeRateQuery();
  const rate = data ? Number(data.rate) : undefined;

  return {
    display,
    price: (
      listing: Pick<Listing, 'price' | 'currency' | 'tx'>,
      opts: Omit<FormatPriceOptions, 'display' | 'rate'> = {},
    ) => formatPrice(listing, t, { ...opts, display, rate }),
    pin: (listing: Pick<Listing, 'price' | 'currency'>) =>
      pinPrice(listing, t, { display, rate }),
  };
}
