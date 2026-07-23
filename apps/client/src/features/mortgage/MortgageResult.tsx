/**
 * MortgageResult — экран результата ипотечного калькулятора (спека §5).
 *
 * Состояние — общий store (mortgageSlice): кнопки рекомендации (`suggestFix`,
 * §3.2) мутируют его напрямую, экран пересчитывается на месте через
 * `useListingMortgage`, без возврата на форму.
 */
'use client';

import { Check, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAppDispatch } from '@/store/hooks';
import { applyFix, setYears } from '@/store/slices/mortgageSlice';
import { useListingMortgage } from '@/lib/useMortgage';
import { DTI_LIMIT_PCT, niceFloorPrice, suggestFix } from '@/lib/mortgage';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Listing } from '@/lib/mock/types';
import { MiniListingCard } from './MiniListingCard';

export interface MortgageResultProps {
  listing: Listing;
}

export function MortgageResult({ listing }: MortgageResultProps) {
  const t = useTranslations('mortgage');
  const tUnits = useTranslations('units');
  const tCommon = useTranslations('common');
  const dispatch = useAppDispatch();

  const { display, salary, salaryPending, downPct, ratePct, years, price, result } =
    useListingMortgage(listing);

  // Прямой заход на URL результата, пока сохранённые данные ещё грузятся
  // (курс для чужой валюты) — спиннер, не мигаем фолбэком «нет зарплаты».
  const needsConversion = listing.currency !== display;
  const pending = salaryPending || (needsConversion && price == null);

  if (pending) {
    return (
      <div className="mx-auto flex max-w-[560px] items-center justify-center gap-3 px-6 py-24 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} /> {tCommon('loading')}
      </div>
    );
  }

  const recalcLink = (
    <Button asChild variant="outline" className="w-full">
      <Link href={`/listing/${listing.id}/mortgage`}>{t('recalc')}</Link>
    </Button>
  );

  // Зарплата не введена — считать нечего (спека §5, edge-cases).
  if (salary == null || salary <= 0 || price == null || result == null) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <MiniListingCard listing={listing} price={price} display={display} tUnits={tUnits} />
        <p className="mt-6 text-muted-foreground">{t('noSalary')}</p>
        <div className="mt-4">{recalcLink}</div>
      </div>
    );
  }

  const ok = result.affordable;
  const dtiPct = result.dtiPct;
  const barFill = Math.min(dtiPct, 100);

  const fillColor = ok ? 'bg-[#166534]' : 'bg-[#8C2F33]';
  const badgeColors = ok
    ? 'bg-[#E7F3EA] text-[#166534]'
    : 'bg-[#FBEEEE] text-[#8C2F33]';
  const iconBg = ok ? 'bg-[#166534]' : 'bg-[#8C2F33]';

  const fix = !ok
    ? suggestFix({ price, salary, downPct, annualRatePct: ratePct, years })
    : null;

  const rows: { label: string; value: string }[] = [
    { label: t('rowPrice'), value: formatMoney(price, display, tUnits) },
    { label: t('rowDown', { pct: downPct }), value: formatMoney(result.downPayment, display, tUnits) },
    { label: t('rowPrincipal'), value: formatMoney(result.principal, display, tUnits) },
    { label: t('rowMonthly'), value: formatMoney(result.monthly, display, tUnits) },
    {
      label: t('rowTotal', { years: t('yearsValue', { count: years }) }),
      value: formatMoney(result.totalPaid, display, tUnits),
    },
    { label: t('rowInterest'), value: formatMoney(result.totalInterest, display, tUnits) },
  ];

  return (
    <div className="mx-auto max-w-[560px] px-6 py-10">
      <MiniListingCard listing={listing} price={price} display={display} tUnits={tUnits} />

      {/* Бейдж-вердикт */}
      <div
        className={cn(
          'mt-6 inline-flex items-center gap-2 rounded-pill px-4 py-2 text-sm font-bold',
          badgeColors,
        )}
      >
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full', iconBg)}>
          {ok ? (
            <Check size={13} strokeWidth={3} className="text-white" />
          ) : (
            <X size={13} strokeWidth={3} className="text-white" />
          )}
        </span>
        {ok ? t('verdictOk') : t('verdictNo')}
      </div>

      {/* Платёж крупно */}
      <p className="mt-5 text-[40px] font-extrabold leading-none text-ink">
        {formatMoney(result.monthly, display, tUnits)}
        {tUnits('perMonth')}
      </p>
      <p className="mt-1.5 text-muted-foreground">
        {t('resultParams', {
          years: t('yearsValue', { count: years }),
          rate: ratePct,
          loan: formatMoney(result.principal, display, tUnits),
        })}
      </p>

      {/* DTI-шкала */}
      <div className="mt-7">
        <div className="flex items-center justify-end">
          <span className={cn('text-sm font-bold', ok ? 'text-[#166534]' : 'text-[#8C2F33]')}>
            {dtiPct}%
          </span>
        </div>
        <div className="relative mt-1 h-2 w-full overflow-hidden rounded-pill bg-segment-track">
          <div className={cn('h-full rounded-pill', fillColor)} style={{ width: `${barFill}%` }} />
          <div
            className="absolute top-0 h-full w-px bg-ink"
            style={{ left: `${DTI_LIMIT_PCT}%` }}
          />
        </div>
        <div className="relative mt-1 h-4 text-xs text-muted-foreground">
          <span className="absolute -translate-x-1/2" style={{ left: `${DTI_LIMIT_PCT}%` }}>
            {DTI_LIMIT_PCT}%
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {ok
            ? t('dtiOk', { pct: dtiPct, limit: DTI_LIMIT_PCT })
            : t('dtiNo', { pct: dtiPct, limit: DTI_LIMIT_PCT })}
        </p>
      </div>

      {/* Карточка-рекомендация (только при NO) */}
      {fix && (
        <div className="mt-6 rounded-feature border border-border bg-surface-2 p-5">
          <p className="text-base font-extrabold text-ink">{t('fixTitle')}</p>
          {fix.type === 'term' && (
            <>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t('fixTermText', {
                  years: t('yearsValue', { count: fix.years }),
                  monthly: formatMoney(fix.monthly, display, tUnits),
                  pct: fix.dtiPct,
                })}
              </p>
              <Button
                type="button"
                className="mt-3 w-full"
                onClick={() => dispatch(setYears(fix.years))}
              >
                {t('fixTermCta', { years: t('yearsValue', { count: fix.years }) })}
              </Button>
            </>
          )}
          {fix.type === 'downPayment' && (
            <>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t('fixDownText', {
                  pct: fix.downPct,
                  monthly: formatMoney(fix.monthly, display, tUnits),
                  dti: fix.dtiPct,
                })}
              </p>
              <Button
                type="button"
                className="mt-3 w-full"
                onClick={() => dispatch(applyFix({ downPct: fix.downPct, years: fix.years }))}
              >
                {t('fixDownCta', { pct: fix.downPct })}
              </Button>
            </>
          )}
          {fix.type === 'budget' && (
            <>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t('fixBudgetText', {
                  price: formatMoney(niceFloorPrice(fix.maxPrice, display), display, tUnits),
                })}
              </p>
              <Button asChild className="mt-3 w-full">
                <Link
                  href={`/search?priceMax=${niceFloorPrice(fix.maxPrice, display)}&currency=${display}`}
                >
                  {t('fixBudgetCta', {
                    price: formatMoney(niceFloorPrice(fix.maxPrice, display), display, tUnits),
                  })}
                </Link>
              </Button>
            </>
          )}
        </div>
      )}

      {/* Таблица-разбивка */}
      <div className="mt-7 divide-y divide-border rounded-feature border border-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-bold text-ink">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-6">{recalcLink}</div>

      <p className="mt-6 text-xs text-muted-foreground">{t('disclaimer')}</p>
    </div>
  );
}
