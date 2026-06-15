/**
 * ActiveFilters — ряд чипов активных фильтров под FilterBar.
 *
 * Показывает по одному чипу на каждый выставленный фильтр (type, districtId,
 * rooms, price, query). Чип × убирает соответствующий URL-параметр через
 * router.replace. «Сбросить всё» очищает все фильтры одним переходом,
 * сохраняя tx и view. Если активных фильтров нет — рендерит null.
 */
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/navigation';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { type FilterValues } from './FilterBar';
import { type District } from '@/lib/mock/types';

export interface ActiveFiltersProps {
  values: FilterValues;
  districts: District[];
}

/**
 * Один чип активного фильтра.
 * label — текстовая подпись чипа, onRemove — колбэк удаления.
 */
function FilterChip({
  label,
  onRemove,
  removeAriaLabel,
}: {
  label: string;
  onRemove: () => void;
  removeAriaLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeAriaLabel}
        className={cn(
          'ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground transition-colors',
          'hover:bg-border hover:text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        )}
      >
        <X size={12} strokeWidth={2.5} aria-hidden />
      </button>
    </span>
  );
}

export function ActiveFilters({ values, districts }: ActiveFiltersProps) {
  const t = useTranslations('search.filters');
  const tEnums = useTranslations('enums');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /** Строит URLSearchParams из текущего URL и применяет патч. */
  const setParams = React.useCallback(
    (patch: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(patch)) {
        if (val == null) params.delete(key);
        else params.set(key, val);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Сформируем список активных чипов.
  type ChipDef = { key: string; label: string; param: string };
  const chips: ChipDef[] = [];

  if (values.type) {
    const label = tEnums(`propertyType.${values.type}`);
    chips.push({ key: 'type', label, param: 'type' });
  }

  if (values.districtId) {
    const district = districts.find((d) => d.id === values.districtId);
    const label = district?.name ?? values.districtId;
    chips.push({ key: 'district_id', label, param: 'district_id' });
  }

  if (values.rooms != null) {
    const label = t('roomsCount', {
      count: values.rooms === 4 ? '4+' : String(values.rooms),
    });
    chips.push({ key: 'rooms', label, param: 'rooms' });
  }

  if (values.priceMin || values.priceMax) {
    const label = t('priceRange', {
      min: values.priceMin || '0',
      max: values.priceMax || '∞',
    });
    chips.push({ key: 'price', label, param: '__price' });
  }

  if (values.query) {
    const label = t('queryChip', { query: values.query });
    chips.push({ key: 'query', label, param: 'query' });
  }

  // Если фильтров нет — ничего не рендерим.
  if (chips.length === 0) return null;

  const handleRemove = (chip: ChipDef) => {
    if (chip.param === '__price') {
      setParams({ priceMin: undefined, priceMax: undefined });
    } else {
      setParams({ [chip.param]: undefined });
    }
  };

  const handleResetAll = () => {
    setParams({
      type: undefined,
      district_id: undefined,
      rooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
      query: undefined,
    });
  };

  return (
    <div
      role="group"
      aria-label={t('activeFilters')}
      className="flex flex-wrap items-center gap-2 px-5 pb-2.5 pt-0"
    >
      {chips.map((chip) => (
        <FilterChip
          key={chip.key}
          label={chip.label}
          onRemove={() => handleRemove(chip)}
          removeAriaLabel={t('removeFilter', { label: chip.label })}
        />
      ))}

      <button
        type="button"
        onClick={handleResetAll}
        className={cn(
          'text-[13px] font-semibold text-muted-foreground underline-offset-2 transition-colors',
          'hover:text-ink hover:underline',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        )}
      >
        {t('resetAll')}
      </button>
    </div>
  );
}
