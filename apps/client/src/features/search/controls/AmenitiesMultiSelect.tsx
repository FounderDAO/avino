/**
 * AmenitiesMultiSelect — мультивыбор удобств (Zillow Phase 2, ADR-0111).
 * Чекбоксы по AMENITIES; тоггл add/remove; «Снять все» → [].
 * Зеркало ParkingMultiSelect, но мультивыбор (toggle в массиве).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AMENITIES, type Amenity } from '@/lib/mock/types';
import { cn } from '@/lib/utils';

export interface AmenitiesMultiSelectProps {
  value: Amenity[];
  onChange: (next: Amenity[]) => void;
}

export function AmenitiesMultiSelect({ value, onChange }: AmenitiesMultiSelectProps) {
  const tEnums = useTranslations('enums');
  const tFilters = useTranslations('search.filters');

  const toggle = (amenity: Amenity) => {
    if (value.includes(amenity)) onChange(value.filter((v) => v !== amenity));
    else onChange([...value, amenity]);
  };

  return (
    <div className="flex flex-col gap-1">
      {AMENITIES.map((amenity) => (
        <label
          key={amenity}
          className={cn(
            'inline-flex cursor-pointer items-center gap-3 rounded-lg px-3 py-[9px] text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
            value.includes(amenity) && 'bg-mint',
          )}
        >
          <input
            type="checkbox"
            checked={value.includes(amenity)}
            onChange={() => toggle(amenity)}
            className="h-4 w-4 rounded border-border accent-ink"
          />
          {tEnums(`amenities.${amenity}`)}
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
