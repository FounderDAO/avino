/**
 * MortgagePaymentCard — карточка «Ежемесячный платёж» в теле detail (спека §6.2):
 * оценка платежа + параметры (взнос/ставка/срок) + структура первого платежа
 * аннуитета (проценты/тело, stacked bar + легенда) + ссылка на калькулятор.
 *
 * Только для продажи (tx === 'SALE'). Параметры расчёта — сохранённые
 * предпочтения пользователя (mortgageSlice) через useListingMortgage;
 * реактивна на изменения в калькуляторе через общий Redux store, без сети и
 * без зарплаты (DTI здесь не считается и не показывается).
 *
 * Detail.tsx — async server component, поэтому вынесена в клиентскую
 * обёртку (тот же паттерн, что DetailPrice/DetailMap/Facts).
 */
'use client';

import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import { useListingMortgage } from '@/lib/useMortgage';
import type { Listing } from '@/lib/mock/types';

export interface MortgagePaymentCardProps {
  listing: Pick<Listing, 'id' | 'price' | 'currency' | 'tx'>;
  className?: string;
}

/** «8» без дробной части если ставка целая, иначе «8.5» (спека §7) — знак
 *  процента уже есть в шаблоне `mortgage.cardParams`. */
function formatRateNumber(pct: number): string {
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

export function MortgagePaymentCard({ listing, className }: MortgagePaymentCardProps) {
  const t = useTranslations('mortgage');
  const tUnits = useTranslations('units');
  const { display, price, result, firstPayment, downPct, ratePct, years } = useListingMortgage(
    listing.tx === 'SALE' ? listing : null,
  );

  if (listing.tx !== 'SALE') return null;
  // Курс ещё не загружен и валюта листинга ≠ валюта показа — не показываем NaN.
  if (price == null || result == null || firstPayment == null) return null;

  const totalFirst = firstPayment.interest + firstPayment.principalPart;
  const interestPct = totalFirst > 0 ? (firstPayment.interest / totalFirst) * 100 : 0;
  const principalPct = 100 - interestPct;

  return (
    <div className={'rounded-feature border border-border bg-surface-2 p-5 ' + (className ?? '')}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {t('cardEstimateLabel')}
        <span className="inline-flex shrink-0" title={t('cardEstimateLabel')}>
          <Info size={14} strokeWidth={2} />
        </span>
      </div>

      <h2 className="mt-1.5 text-[19px]">{t('cardTitle')}</h2>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[32px] font-extrabold leading-none">
          {formatMoney(result.monthly, display, tUnits)}
        </span>
        <span className="text-[15px] font-semibold text-muted-foreground">
          {tUnits('perMonth')}
        </span>
      </div>

      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        {t('cardParams', {
          downPct,
          rate: formatRateNumber(ratePct),
          years: t('yearsValue', { count: years }),
        })}
      </p>

      <div className="mt-5">
        <div className="text-[13.5px] font-bold">{t('firstPaymentTitle')}</div>
        <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
          {interestPct > 0 && (
            <div className="h-full bg-teal" style={{ width: `${interestPct}%` }} />
          )}
          {principalPct > 0 && (
            <div className="h-full bg-green" style={{ width: `${principalPct}%` }} />
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-teal" />
            {t('legendInterest')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-green" />
            {t('legendPrincipal')}
          </span>
        </div>
      </div>

      <Link
        href={`/listing/${listing.id}/mortgage`}
        className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-teal hover:text-teal-deep"
      >
        {t('cardCta')}
      </Link>
    </div>
  );
}
