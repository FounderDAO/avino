'use client';

/**
 * PriceFilter — Zillow-вид фильтра цены: Popover с вкладками «Цена / Ежемесячный платёж»,
 * гистограммой распределения и слайдером. Контейнер тянет распределение через RTK Query
 * только при открытии Popover (ленивый mount PriceFilterBody).
 *
 * Вкладка «Ежемесячный платёж» — заглушка «Скоро» (Phase 2).
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useGetPriceDistributionQuery } from '@/store/api/priceDistributionApi';
import { compactPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { clamp, toAppliedRange, type PriceDomain, type PriceDraft } from './controls/priceRange';
import { PriceRangeControl } from './controls/PriceRangeControl';
import { TriggerButton } from './TriggerButton';
import type { Currency, TransactionType } from '@/lib/mock/types';

/** Фолбэк-потолок домена, когда распределения ещё нет / пусто. */
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
        {/* Контент монтируется только при открытии → запрос распределения идёт по первому открытию */}
        <PriceFilterBody {...props} close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function initDraft(value: { priceMin?: string; priceMax?: string }, domain: PriceDomain): PriceDraft {
  const min = value.priceMin ? clamp(Number(value.priceMin), domain.min, domain.max) : domain.min;
  const max = value.priceMax ? clamp(Number(value.priceMax), domain.min, domain.max) : domain.max;
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
  const [tab, setTab] = React.useState<'list' | 'monthly'>('list');

  const { data } = useGetPriceDistributionQuery({ currency: displayCurrency, transactionType: tx });

  const domain: PriceDomain = React.useMemo(
    () => ({ min: 0, max: data && data.max > 0 ? data.max : FALLBACK_MAX[displayCurrency] }),
    [data, displayCurrency],
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
    const { priceMin, priceMax } = toAppliedRange(draft, domain);
    onApply(priceMin, priceMax, displayCurrency);
    close();
  };
  const reset = () => {
    onReset();
    close();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Вкладки */}
      <div role="tablist" className="flex gap-1 rounded-pill border-[1.5px] border-border p-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'list'}
          onClick={() => setTab('list')}
          className={cn(
            'flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors',
            tab === 'list' ? 'bg-mint text-teal' : 'text-muted-foreground',
          )}
        >
          {t('price')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'monthly'}
          onClick={() => setTab('monthly')}
          className={cn(
            'flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors',
            tab === 'monthly' ? 'bg-mint text-teal' : 'text-muted-foreground',
          )}
        >
          {t('priceTabMonthly')}
        </button>
      </div>

      {tab === 'monthly' ? (
        <div className="py-8 text-center text-sm font-semibold text-muted-foreground">
          {t('priceTabMonthlySoon')}
        </div>
      ) : (
        <>
          <PriceRangeControl
            domain={domain}
            buckets={data?.buckets ?? []}
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
              className="flex-1 rounded-pill bg-teal px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-teal/90"
            >
              {t('apply')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
