/**
 * MortgageEstBar — мятная est-полоска рядом с ценой на detail (спека §6.1):
 * «Ипотека ≈ {monthly}/мес» + ссылка «Рассчитать ипотеку» → форма калькулятора.
 *
 * Только для продажи (tx === 'SALE') — аренда уже показывается «/мес», ипотека
 * не применима. Параметры расчёта (взнос/ставка/срок) — сохранённые
 * предпочтения пользователя из mortgageSlice через useListingMortgage; при их
 * изменении на экране калькулятора цифры здесь обновляются реактивно (общий
 * Redux store), без сети и без зарплаты.
 *
 * Detail.tsx — async server component, поэтому расчёт вынесен в клиентскую
 * обёртку (тот же паттерн, что DetailPrice/DetailMap).
 */
'use client';

import { useTranslations } from 'next-intl';
import { Calculator } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import { useListingMortgage } from '@/lib/useMortgage';
import type { Listing } from '@/lib/mock/types';

export interface MortgageEstBarProps {
  listing: Pick<Listing, 'id' | 'price' | 'currency' | 'tx'>;
}

export function MortgageEstBar({ listing }: MortgageEstBarProps) {
  const t = useTranslations('mortgage');
  const tUnits = useTranslations('units');
  const { display, price, result } = useListingMortgage(
    listing.tx === 'SALE' ? listing : null,
  );

  if (listing.tx !== 'SALE') return null;
  // Курс ещё не загружен и валюта листинга ≠ валюта показа — не показываем NaN.
  if (price == null || result == null) return null;

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-feature bg-mint px-4 py-3">
      <span className="inline-flex items-center gap-2 text-[15px] font-bold text-teal">
        <Calculator size={17} strokeWidth={2} className="shrink-0" />
        {t('estMonthly', { monthly: formatMoney(result.monthly, display, tUnits) })}
      </span>
      <Link
        href={`/listing/${listing.id}/mortgage`}
        className="text-[14px] font-bold text-teal underline underline-offset-2 hover:text-teal-deep"
      >
        {t('estCta')}
      </Link>
    </div>
  );
}
