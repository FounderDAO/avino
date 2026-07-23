/**
 * BathroomsControl — выбор «N+ санузлов» в стиле Zillow (без exact-match).
 * Кнопки «Любое / 1+ / 1.5+ / 2+ / 2.5+ / 3+ / 4+». Клик по выбранной снимает выбор.
 * Набор значений зафиксирован (3.5 убран) и зеркалит валидацию API
 * (`bathrooms_min` принимает только 1 / 1.5 / 2 / 2.5 / 3 / 4).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Pill } from '@/components/ui/pill';

export interface BathroomsControlProps {
  /** Текущий выбор «N+» (undefined = Любое). */
  value?: number;
  onChange: (next?: number) => void;
}

const BATHROOM_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1+' },
  { value: 1.5, label: '1.5+' },
  { value: 2, label: '2+' },
  { value: 2.5, label: '2.5+' },
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
];

export function BathroomsControl({ value, onChange }: BathroomsControlProps) {
  const t = useTranslations('search.filters');
  return (
    /* Одной линией без переноса (7 пилюль — контейнер должен быть ≥ ~390px) */
    <div className="flex flex-nowrap gap-1.5 overflow-x-auto">
      <Pill
        active={value === undefined}
        onClick={() => onChange(undefined)}
        className="shrink-0 px-2.5"
      >
        {t('any')}
      </Pill>
      {BATHROOM_OPTIONS.map((opt) => (
        <Pill
          key={opt.value}
          active={value === opt.value}
          onClick={() => onChange(value === opt.value ? undefined : opt.value)}
          className="shrink-0 px-2.5"
        >
          {opt.label}
        </Pill>
      ))}
    </div>
  );
}
