/**
 * BathroomsControl — выбор «N+ санузлов» в стиле Zillow (без exact-match).
 * Кнопки «Любое / 1+ / 1.5+ / 2+ / … / 4+». Клик по выбранной снимает выбор.
 * Шаг 0.5 (LAST_CHANGED_API.md §1: `bathrooms_min` принимает дробные).
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
  { value: 3.5, label: '3.5+' },
  { value: 4, label: '4+' },
];

export function BathroomsControl({ value, onChange }: BathroomsControlProps) {
  const t = useTranslations('search.filters');
  return (
    <div className="flex flex-wrap gap-2">
      <Pill active={value === undefined} onClick={() => onChange(undefined)}>
        {t('any')}
      </Pill>
      {BATHROOM_OPTIONS.map((opt) => (
        <Pill
          key={opt.value}
          active={value === opt.value}
          onClick={() => onChange(value === opt.value ? undefined : opt.value)}
        >
          {opt.label}
        </Pill>
      ))}
    </div>
  );
}
