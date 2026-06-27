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

  // Тип жилья: при мультивыборе (>1) — чип-счётчик «Тип жилья: N»; при одном
  // выбранном типе (или legacy single `type`) — имя типа. × в обоих случаях
  // удаляет параметр `type` целиком (все значения).
  if (values.types && values.types.length > 1) {
    const label = t('propertyTypeCount', { count: String(values.types.length) });
    chips.push({ key: 'types', label, param: '__types' });
  } else {
    const single = values.types?.[0] ?? values.type;
    if (single) {
      const label = tEnums(`propertyType.${single}`);
      chips.push({ key: 'type', label, param: 'type' });
    }
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

  if (values.roomsMin != null) {
    const label = t('roomsCount', { count: `${String(values.roomsMin)}+` });
    chips.push({ key: 'rooms_min', label, param: 'rooms_min' });
  }

  if (values.bathroomsMin != null) {
    const label = t('bathroomsCount', { count: `${String(values.bathroomsMin)}+` });
    chips.push({ key: 'bathrooms_min', label, param: 'bathrooms_min' });
  }

  if (values.priceMin || values.priceMax) {
    const label = t('priceRange', {
      min: values.priceMin || '0',
      max: values.priceMax || '∞',
    });
    chips.push({ key: 'price', label, param: '__price' });
  }

  if (values.areaMin || values.areaMax) {
    const label = `${t('areaTitle')}: ${values.areaMin || '0'}–${values.areaMax || '∞'}`;
    chips.push({ key: 'area', label, param: '__area' });
  }

  if (values.lotAreaMin || values.lotAreaMax) {
    const label = `${t('lotAreaTitle')}: ${values.lotAreaMin || '0'}–${values.lotAreaMax || '∞'}`;
    chips.push({ key: 'lot_area', label, param: '__lot_area' });
  }

  if (values.floorMin || values.floorMax) {
    const label = `${t('floorTitle')}: ${values.floorMin || '0'}–${values.floorMax || '∞'}`;
    chips.push({ key: 'floor', label, param: '__floor' });
  }

  if (values.totalFloorsMin || values.totalFloorsMax) {
    const label = `${t('totalFloorsTitle')}: ${values.totalFloorsMin || '0'}–${values.totalFloorsMax || '∞'}`;
    chips.push({ key: 'total_floors', label, param: '__total_floors' });
  }

  if (values.yearMin || values.yearMax) {
    const label = `${t('yearTitle')}: ${values.yearMin || '0'}–${values.yearMax || '∞'}`;
    chips.push({ key: 'year', label, param: '__year' });
  }

  if (values.notFirstFloor) {
    chips.push({ key: 'not_first_floor', label: t('notFirstFloor'), param: 'not_first_floor' });
  }

  if (values.notLastFloor) {
    chips.push({ key: 'not_last_floor', label: t('notLastFloor'), param: 'not_last_floor' });
  }

  if (values.listingSource) {
    const label = values.listingSource === 'OWNER' ? t('sourceOwner') : t('sourceAgency');
    chips.push({ key: 'listing_source', label, param: 'listing_source' });
  }

  if (values.toursEnabled) {
    chips.push({ key: 'tours_enabled', label: t('toursEnabled'), param: 'tours_enabled' });
  }

  if (values.parkingTypes && values.parkingTypes.length > 0) {
    const label = values.parkingTypes.length > 1
      ? t('parkingCount', { count: String(values.parkingTypes.length) })
      : tEnums(`parking.${values.parkingTypes[0]}`);
    chips.push({ key: 'parking', label, param: '__parking' });
  }

  if (values.amenities && values.amenities.length > 0) {
    const label = values.amenities.length > 1
      ? `${t('amenitiesTitle')}: ${String(values.amenities.length)}`
      : tEnums(`amenities.${values.amenities[0]}`);
    chips.push({ key: 'amenities', label, param: '__amenities' });
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
    } else if (chip.param === '__types') {
      // Удаляем все повторяющиеся ?type= через прямое URLSearchParams.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('type');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    } else if (chip.param === '__area') {
      setParams({ area_min: undefined, area_max: undefined });
    } else if (chip.param === '__lot_area') {
      setParams({ lot_area_min: undefined, lot_area_max: undefined });
    } else if (chip.param === '__floor') {
      setParams({ floor_min: undefined, floor_max: undefined });
    } else if (chip.param === '__total_floors') {
      setParams({ total_floors_min: undefined, total_floors_max: undefined });
    } else if (chip.param === '__year') {
      setParams({ year_min: undefined, year_max: undefined });
    } else if (chip.param === '__parking') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('parking_type');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    } else if (chip.param === '__amenities') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('amenities');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    } else {
      setParams({ [chip.param]: undefined });
    }
  };

  const handleResetAll = () => {
    // Используем прямое URLSearchParams для удаления ?type= (повторяющийся).
    const params = new URLSearchParams(searchParams.toString());
    const keysToDelete = [
      'type', 'district_id', 'rooms', 'rooms_min', 'bathrooms_min',
      'priceMin', 'priceMax',
      'area_min', 'area_max',
      'lot_area_min', 'lot_area_max',
      'floor_min', 'floor_max',
      'total_floors_min', 'total_floors_max',
      'year_min', 'year_max',
      'not_first_floor', 'not_last_floor',
      'listing_source', 'tours_enabled',
      'parking_type',
      'amenities',
      'query',
    ];
    for (const key of keysToDelete) {
      params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
