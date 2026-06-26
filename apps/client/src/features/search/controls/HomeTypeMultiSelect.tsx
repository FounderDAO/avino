/**
 * HomeTypeMultiSelect — мультивыбор типов жилья (Zillow Home Type).
 *
 * Чекбоксы по каждому из PROPERTY_TYPES.
 * Кнопка «Снять все» сбрасывает выбор в [].
 * Тоггл элемента: если уже в массиве — убирает, если нет — добавляет.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { PROPERTY_TYPES, type PropertyType } from '@/lib/mock/types';
import { cn } from '@/lib/utils';

export interface HomeTypeMultiSelectProps {
  /** Массив выбранных типов (пустой = все типы не выбраны). */
  value: PropertyType[];
  /** Вызывается с новым массивом при каждом изменении. */
  onChange: (next: PropertyType[]) => void;
}

export function HomeTypeMultiSelect({ value, onChange }: HomeTypeMultiSelectProps) {
  const tEnums = useTranslations('enums');
  const tFilters = useTranslations('search.filters');

  const toggle = (type: PropertyType) => {
    if (value.includes(type)) {
      onChange(value.filter((v) => v !== type));
    } else {
      onChange([...value, type]);
    }
  };

  const deselectAll = () => onChange([]);

  return (
    <div className="flex flex-col gap-1">
      {PROPERTY_TYPES.map((type) => (
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
          {tEnums(`propertyType.${type}`)}
        </label>
      ))}

      {/* Снять все — показываем только если есть хоть что-то выбранное */}
      {value.length > 0 && (
        <button
          type="button"
          onClick={deselectAll}
          className="mt-1 self-start rounded-lg px-3 py-[7px] text-[13px] font-semibold text-muted-foreground transition-colors hover:text-ink"
        >
          {tFilters('deselectAll')}
        </button>
      )}
    </div>
  );
}
