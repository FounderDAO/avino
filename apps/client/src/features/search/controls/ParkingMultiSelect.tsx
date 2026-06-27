/**
 * ParkingMultiSelect — мультивыбор типов парковки (Zillow Phase 2).
 * Чекбоксы по PARKING_TYPES; тоггл add/remove; «Снять все» → [].
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { PARKING_TYPES, type ParkingType } from '@/lib/mock/types';
import { cn } from '@/lib/utils';

export interface ParkingMultiSelectProps {
  value: ParkingType[];
  onChange: (next: ParkingType[]) => void;
}

export function ParkingMultiSelect({ value, onChange }: ParkingMultiSelectProps) {
  const tEnums = useTranslations('enums');
  const tFilters = useTranslations('search.filters');

  const toggle = (type: ParkingType) => {
    if (value.includes(type)) onChange(value.filter((v) => v !== type));
    else onChange([...value, type]);
  };

  return (
    <div className="flex flex-col gap-1">
      {PARKING_TYPES.map((type) => (
        <label
          key={type}
          className={cn(
            'inline-flex cursor-pointer items-center gap-3 rounded-lg px-3 py-[9px] text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
            value.includes(type) && 'bg-mint',
          )}
        >
          <input
            type="checkbox"
            checked={value.includes(type)}
            onChange={() => toggle(type)}
            className="h-4 w-4 rounded border-border accent-ink"
          />
          {tEnums(`parking.${type}`)}
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
