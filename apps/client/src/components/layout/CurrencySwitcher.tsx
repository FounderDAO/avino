/**
 * CurrencySwitcher — переключатель валюты отображения цен (UZS / USD).
 * Сегментный контрол, стилистически согласован с LangSwitcher:
 * тот же pill-бордер (rounded-pill border-[1.5px] border-border), те же цвета ink/muted.
 */
'use client';

import { useTranslations } from 'next-intl';
import { useCurrencyPreference, useSetCurrency } from '@/lib/useCurrencyPreference';

export function CurrencySwitcher() {
  const t = useTranslations('nav');
  const display = useCurrencyPreference();
  const setCurrency = useSetCurrency();

  return (
    <div
      className="inline-flex items-center rounded-pill border-[1.5px] border-border p-0.5 text-[13.5px] font-bold"
      aria-label={t('currencyLabel')}
    >
      <button
        type="button"
        aria-pressed={display === 'UZS'}
        className={
          display === 'UZS'
            ? 'rounded-pill bg-ink px-2.5 py-[5px] text-white'
            : 'px-2.5 py-[5px] text-muted-foreground hover:text-ink'
        }
        onClick={() => setCurrency('UZS')}
      >
        {t('currencyUZS')}
      </button>
      <button
        type="button"
        aria-pressed={display === 'USD'}
        className={
          display === 'USD'
            ? 'rounded-pill bg-ink px-2.5 py-[5px] text-white'
            : 'px-2.5 py-[5px] text-muted-foreground hover:text-ink'
        }
        onClick={() => setCurrency('USD')}
      >
        {t('currencyUSD')}
      </button>
    </div>
  );
}
