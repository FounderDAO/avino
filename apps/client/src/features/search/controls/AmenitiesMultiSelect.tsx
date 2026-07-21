/**
 * AmenitiesMultiSelect — мультивыбор удобств (Zillow Phase 2, ADR-0111).
 * Чекбоксы по динамическому справочнику GET /amenities (Task 5); тоггл
 * add/remove; «Снять все» → [].
 * Зеркало ParkingMultiSelect, но мультивыбор (toggle в массиве).
 */
'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useListAmenitiesQuery } from '@/store/api/amenitiesApi';
import { amenityLabel } from '@/lib/amenities';
import { cn } from '@/lib/utils';

export interface AmenitiesMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function AmenitiesMultiSelect({ value, onChange }: AmenitiesMultiSelectProps) {
  const locale = useLocale();
  const tFilters = useTranslations('search.filters');
  const { data: amenities = [] } = useListAmenitiesQuery();

  const toggle = (code: string) => {
    if (value.includes(code)) onChange(value.filter((v) => v !== code));
    else onChange([...value, code]);
  };

  return (
    <div className="flex flex-col gap-1">
      {amenities.map((a) => (
        <label
          key={a.code}
          className={cn(
            'inline-flex cursor-pointer items-center gap-3 rounded-lg px-3 py-[9px] text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
            value.includes(a.code) && 'bg-mint',
          )}
        >
          <input
            type="checkbox"
            checked={value.includes(a.code)}
            onChange={() => toggle(a.code)}
            className="h-4 w-4 rounded border-border accent-ink"
          />
          {amenityLabel(a, locale)}
        </label>
      ))}
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mt-1 self-start rounded-lg px-3 py-[7px] text-[13px] font-semibold text-muted-foreground transition-colors hover:text-ink"
        >
          {tFilters('deselectAll')}
        </button>
      )}
    </div>
  );
}
