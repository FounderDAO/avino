/**
 * MortgageForm — экран ввода параметров ипотечного калькулятора (спека §4).
 *
 * Общий store (mortgageSlice) — каждое изменение поля сразу диспатчится и
 * персистится в localStorage самим action'ом слайса. Зарплата приватна: живёт
 * только в Redux/localStorage, наружу (в API) не уходит.
 *
 * Смена валюты показа (§4.5): `useListingMortgage` пересчитывает salary/price
 * реактивно, локальный текст поля зарплаты синхронизируется эффектом ниже —
 * см. doc-комментарий у `lastAppliedRef`.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAppDispatch } from '@/store/hooks';
import { setDownPct, setRatePct, setSalary, setYears } from '@/store/slices/mortgageSlice';
import { useListingMortgage } from '@/lib/useMortgage';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/field';
import { Chip } from '@/components/ui/pill';
import { cn } from '@/lib/utils';
import type { Listing } from '@/lib/mock/types';
import { MiniListingCard } from './MiniListingCard';
import { digitsOnly, groupThousands } from './salaryFormat';

export interface MortgageFormProps {
  listing: Listing;
}

const DOWN_PAYMENT_CHIPS = [15, 20, 30, 40];
const RATE_MIN = 1;
const RATE_MAX = 24;
const RATE_STEP = 0.5;
const YEARS_MIN = 5;
const YEARS_MAX = 30;

export function MortgageForm({ listing }: MortgageFormProps) {
  const t = useTranslations('mortgage');
  const tUnits = useTranslations('units');
  const dispatch = useAppDispatch();
  const router = useRouter();

  const { display, salary, salaryPending, downPct, ratePct, years, price } =
    useListingMortgage(listing);

  // Текст поля зарплаты — локальные «сырые» цифры (без группировки, она
  // считается на рендере). Синхронизируется с store, когда его значение
  // меняется НЕ из-за нашего же dispatch (первичный префилл localStorage
  // и/или переконвертация при смене валюты показа, §4.4/§4.5). Пока
  // курс для чужой валюты грузится (salaryPending) — `salary` из хука null,
  // эффект молчит, префилл прилетит одним апдейтом, когда курс подгрузится.
  const [raw, setRaw] = React.useState('');
  const lastAppliedRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (salary != null && salary !== lastAppliedRef.current) {
      lastAppliedRef.current = salary;
      setRaw(String(salary));
    } else if (salary == null && !salaryPending && lastAppliedRef.current != null) {
      // Зарплата сохранена в другой валюте, а курс недоступен — не показываем
      // число в чужой валюте, поле остаётся пустым (спека §4.4).
      lastAppliedRef.current = null;
      setRaw('');
    }
  }, [salary, salaryPending]);

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = digitsOnly(e.target.value);
    setRaw(digits);
    const value = digits ? Number(digits) : null;
    lastAppliedRef.current = value;
    dispatch(setSalary({ value, currency: display }));
  };

  const salaryValue = raw ? Number(raw) : 0;

  const handleDownPct = (value: number) => {
    dispatch(setDownPct(value));
  };

  const handleRate = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setRatePct({ currency: display, value: Number(e.target.value) }));
  };

  const handleYears = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setYears(Number(e.target.value)));
  };

  const downPayment = price != null ? (price * downPct) / 100 : null;
  const loan = price != null && downPayment != null ? price - downPayment : null;

  const currencySymbol = display === 'USD' ? '$' : tUnits('sum');

  const handleSubmit = () => {
    if (salaryValue <= 0) return;
    router.push(`/listing/${listing.id}/mortgage/result`);
  };

  return (
    <div className="mx-auto max-w-[560px] px-6 py-10">
      {/* Назад к объявлению — Link (не router.back), чтобы работал и прямой заход по URL. */}
      <Link
        href={`/listing/${listing.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-teal hover:text-teal-deep"
      >
        <ChevronLeft size={18} /> {t('backToListing')}
      </Link>

      <h1 className="text-2xl font-extrabold text-ink">{t('title')}</h1>

      <div className="mt-5">
        <MiniListingCard listing={listing} price={price} display={display} tUnits={tUnits} />
      </div>

      {/* Зарплата */}
      <div className="mt-7">
        <label htmlFor="mortgage-salary" className="text-sm font-bold text-ink">
          {t('salaryLabel')}
        </label>
        <div className="relative mt-2">
          <input
            id="mortgage-salary"
            inputMode="numeric"
            autoComplete="off"
            className={cn(fieldClass, 'pr-28')}
            value={groupThousands(raw)}
            onChange={handleSalaryChange}
            placeholder="0"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
            {t('salarySuffix', { currency: currencySymbol })}
          </span>
        </div>
      </div>

      {/* Первоначальный взнос */}
      <div className="mt-7">
        <p className="text-sm font-bold text-ink">{t('downPaymentLabel')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DOWN_PAYMENT_CHIPS.map((pct) => (
            <Chip key={pct} active={downPct === pct} onClick={() => handleDownPct(pct)}>
              {pct}%
            </Chip>
          ))}
        </div>
        {downPayment != null && loan != null && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {t('downBreakdown', {
              down: formatMoney(downPayment, display, tUnits),
              loan: formatMoney(loan, display, tUnits),
            })}
          </p>
        )}
      </div>

      {/* Годовая ставка */}
      <div className="mt-7">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink">{t('rateLabel')}</p>
          <p className="text-lg font-extrabold text-ink">{ratePct}%</p>
        </div>
        <input
          type="range"
          min={RATE_MIN}
          max={RATE_MAX}
          step={RATE_STEP}
          value={ratePct}
          onChange={handleRate}
          className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-pill bg-segment-track accent-red"
          aria-label={t('rateLabel')}
        />
      </div>

      {/* Срок */}
      <div className="mt-7">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink">{t('termLabel')}</p>
          <p className="text-lg font-extrabold text-ink">{t('yearsValue', { count: years })}</p>
        </div>
        <input
          type="range"
          min={YEARS_MIN}
          max={YEARS_MAX}
          step={1}
          value={years}
          onChange={handleYears}
          className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-pill bg-segment-track accent-red"
          aria-label={t('termLabel')}
        />
      </div>

      <Button
        type="button"
        className="mt-8 w-full"
        size="lg"
        disabled={salaryValue <= 0}
        onClick={handleSubmit}
      >
        {t('cta')}
      </Button>
    </div>
  );
}
