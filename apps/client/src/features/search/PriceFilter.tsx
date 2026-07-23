'use client';

/**
 * PriceFilter — Zillow-вид фильтра цены: Popover с гистограммой распределения и слайдером.
 * Домен и гистограмма считаются на клиенте из цен текущей выдачи (стор `resultPricesSlice`),
 * а не запросом к API — контейнер лишь ленивый mount PriceFilterBody при открытии Popover.
 *
 * Вкладка «Ежемесячный платёж» (заглушка «Скоро», Phase 2) временно скрыта —
 * разметка вкладок и state `tab` закомментированы в теле компонента.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useAppSelector } from '@/store/hooks';
import { selectResultPrices } from '@/store/resultPricesSlice';
import { useGetExchangeRateQuery } from '@/store/api/exchangeRateApi';
import { compactPrice } from '@/lib/format';
import {
  clamp,
  toAppliedRange,
  niceCeil,
  toDisplayPrices,
  buildPriceHistogram,
  type PriceDomain,
  type PriceDraft,
} from './controls/priceRange';
import { PriceRangeControl } from './controls/PriceRangeControl';
import { TriggerButton } from './TriggerButton';
import type { Currency, TransactionType } from '@/lib/mock/types';

/** Фолбэк-потолок домена, когда выдача пуста или цены недоступны. */
const FALLBACK_MAX: Record<Currency, number> = {
  USD: 1_000_000,
  UZS: 12_000_000_000,
};

export interface PriceFilterProps {
  value: { priceMin?: string; priceMax?: string };
  tx: TransactionType;
  displayCurrency: Currency;
  currencySymbol: string;
  triggerLabel: string;
  active: boolean;
  onApply: (min: number | undefined, max: number | undefined, currency: Currency) => void;
  onReset: () => void;
}

export function PriceFilter(props: PriceFilterProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TriggerButton label={props.triggerLabel} active={props.active} data-testid="filter-price" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px]">
        {/* Контент монтируется только при открытии → домен/гистограмма считаются лениво */}
        <PriceFilterBody {...props} close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function initDraft(value: { priceMin?: string; priceMax?: string }, domain: PriceDomain): PriceDraft {
  const min = value.priceMin ? clamp(Number(value.priceMin) || domain.min, domain.min, domain.max) : null;
  const max = value.priceMax ? clamp(Number(value.priceMax) || domain.max, domain.min, domain.max) : null;
  return { min, max };
}

function PriceFilterBody({
  value,
  tx,
  displayCurrency,
  currencySymbol,
  onApply,
  onReset,
  close,
}: PriceFilterProps & { close: () => void }) {
  const t = useTranslations('search.filters');
  const tUnits = useTranslations('units');
  // Вкладка «Ежемесячный платёж» временно скрыта (заглушка «Скоро», Phase 2).
  // При возврате функции — раскомментировать state и блок вкладок ниже.
  // const [tab, setTab] = React.useState<'list' | 'monthly'>('list');

  // Цены текущей выдачи (зеркало из SearchResults) → display-валюта по курсу ЦБУ.
  const resultPrices = useAppSelector(selectResultPrices);
  const { data: rateData } = useGetExchangeRateQuery();
  const rate = rateData ? Number(rateData.rate) : undefined;

  const converted = React.useMemo(
    () => toDisplayPrices(resultPrices, displayCurrency, rate),
    [resultPrices, displayCurrency, rate],
  );
  // Домен: [0, niceCeil(max выдачи)]; пусто/нули → фолбэк $1M / 12 млрд сум.
  const maxPrice = converted.length > 0 ? Math.max(...converted) : 0;
  const domain: PriceDomain = React.useMemo(
    () => ({ min: 0, max: maxPrice > 0 ? niceCeil(maxPrice) : FALLBACK_MAX[displayCurrency] }),
    [maxPrice, displayCurrency],
  );
  const buckets = React.useMemo(
    () => buildPriceHistogram(converted, domain),
    [converted, domain],
  );

  const [draft, setDraft] = React.useState<PriceDraft>(() => initDraft(value, domain));
  // Переинициализация только при смене валюты или типа сделки (другая гистограмма).
  // domain.max намеренно исключён: его изменение при загрузке данных не должно
  // сбрасывать пользовательский drag.
  React.useEffect(() => {
    setDraft(initDraft(value, domain));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCurrency, tx]);

  const apply = () => {
    const { priceMin, priceMax } = toAppliedRange(draft);
    onApply(priceMin, priceMax, displayCurrency);
    close();
  };
  const reset = () => {
    onReset();
    close();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Вкладки «Цена / Ежемесячный платёж» временно скрыты — вкладка платежа была
          заглушкой «Скоро» (Phase 2). Раскомментировать блок и state `tab` при возврате.
      <div role="tablist" className="flex gap-1 rounded-pill border-[1.5px] border-border p-1">
        <button type="button" role="tab" aria-selected={tab === 'list'} onClick={() => setTab('list')}
          className={cn('flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors',
            tab === 'list' ? 'bg-mint text-teal' : 'text-muted-foreground')}>
          {t('price')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'monthly'} onClick={() => setTab('monthly')}
          className={cn('flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors',
            tab === 'monthly' ? 'bg-mint text-teal' : 'text-muted-foreground')}>
          {t('priceTabMonthly')}
        </button>
      </div>
      */}

      <PriceRangeControl
        domain={domain}
        buckets={buckets}
        value={draft}
        onChange={setDraft}
        minLabel={t('priceMinLabel')}
        maxLabel={t('priceMaxLabel')}
        fromPlaceholder={`${t('priceFrom')} ${currencySymbol}`}
        toPlaceholder={`${t('priceTo')} ${currencySymbol}`}
        formatLabel={(v) => compactPrice(v, displayCurrency, tUnits)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-pill border-[1.5px] border-border px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink"
        >
          {t('resetAll')}
        </button>
        <button
          type="button"
          onClick={apply}
          className="flex-1 rounded-pill bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary/90"
        >
          {t('apply')}
        </button>
      </div>
    </div>
  );
}
