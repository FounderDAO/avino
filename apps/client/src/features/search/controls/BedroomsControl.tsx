/**
 * BedroomsControl — выбор количества спален/комнат в стиле Zillow.
 *
 * Кнопки «Любое / 1+ / 2+ / 3+ / 4+ / 5+» через Pill.
 * Ниже — чекбокс «Точное совпадение».
 * Клик по уже выбранной Pill снимает выбор (value → undefined).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Pill } from '@/components/ui/pill';

export interface BedroomsControlValue {
  value?: number;
  exact: boolean;
}

export interface BedroomsControlProps {
  /** Текущий выбор «N+» (undefined = Любое). */
  value?: number;
  /** Режим точного совпадения. */
  exact: boolean;
  /** Показывать ли чекбокс «Точное совпадение» (default true). */
  showExact?: boolean;
  /** Вызывается при любом изменении (выбор числа или переключении exact). */
  onChange: (next: BedroomsControlValue) => void;
}

const BEDROOM_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1+' },
  { value: 2, label: '2+' },
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
  { value: 5, label: '5+' },
];

export function BedroomsControl({ value, exact, showExact = true, onChange }: BedroomsControlProps) {
  const t = useTranslations('search.filters');

  const handlePill = (num: number) => {
    // Клик по уже выбранной — снимает выбор
    onChange({ value: value === num ? undefined : num, exact });
  };

  const handleAny = () => {
    onChange({ value: undefined, exact });
  };

  const handleExact = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ value, exact: e.target.checked });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Ряд пилюль — одной линией без переноса (контейнер должен быть ≥ ~320px) */}
      <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
        {/* «Любое» */}
        <Pill active={value === undefined} onClick={handleAny} className="shrink-0 px-3">
          {t('any')}
        </Pill>
        {BEDROOM_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            active={value === opt.value}
            onClick={() => handlePill(opt.value)}
            className="shrink-0 px-3"
          >
            {opt.label}
          </Pill>
        ))}
      </div>

      {/* Чекбокс «Точное совпадение» (скрывается когда showExact=false) */}
      {showExact !== false && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={exact}
            onChange={handleExact}
            className="h-4 w-4 rounded border-border accent-ink"
          />
          {t('exactMatch')}
        </label>
      )}
    </div>
  );
}
