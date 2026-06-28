/**
 * RegionDistrictSelect — контролируемый каскадный компонент «Регион → Район».
 *
 * Чистый контролируемый ввод: не читает URL, не управляет роутером.
 * Донор паттерна — FilterBar (два Dropdown-пилюли, фильтрация districts.filter).
 * i18n-ключи пока берутся из search.filters.*; Task C4 мигрирует в listingNew.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
} from '@/components/ui/dropdown';
import { TriggerButton } from '@/features/search/TriggerButton';
import { cn } from '@/lib/utils';
import type { Region, District } from '@/lib/mock/types';

export interface RegionDistrictSelectProps {
  regions: Region[];
  districts: District[];
  regionId?: string;
  districtId?: string;
  onChange: (next: { regionId?: string; districtId?: string }) => void;
  /** Текущая локаль (резерв для будущей локализации в C4). */
  locale?: string;
}

export function RegionDistrictSelect({
  regions,
  districts,
  regionId,
  districtId,
  onChange,
}: RegionDistrictSelectProps) {
  // i18n: используем search.filters.* — Task C4 добавит ключи в listingNew.
  const t = useTranslations('search');

  const selectedRegion = regions.find((r) => r.id === regionId);
  const regionLabel = selectedRegion?.name ?? t('filters.region');

  // Список районов, отфильтрованных по выбранному региону.
  const regionDistricts = regionId
    ? districts.filter((d) => d.regionId === regionId)
    : [];

  const selectedDistrict = regionId
    ? districts.find((d) => d.id === districtId)
    : undefined;
  const districtLabel = selectedDistrict?.name ?? t('filters.district');

  return (
    <div className="flex gap-2">
      {/* Регион */}
      <Dropdown>
        <DropdownTrigger asChild>
          <TriggerButton
            label={regionLabel}
            active={Boolean(regionId)}
            data-testid="region-trigger"
          />
        </DropdownTrigger>
        <DropdownContent align="start" className="max-h-[320px] w-[240px] overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => onChange({ regionId: undefined, districtId: undefined })}
            className={cn(
              'flex w-full items-center rounded-lg px-3 py-[9px] text-left text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
              !regionId && 'bg-mint',
            )}
          >
            {t('filters.allRegions')}
          </button>
          {regions.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange({ regionId: r.id, districtId: undefined })}
              className={cn(
                'flex w-full items-center rounded-lg px-3 py-[9px] text-left text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
                regionId === r.id && 'bg-mint',
              )}
              data-testid={`region-option-${r.id}`}
            >
              <span className="truncate">{r.name}</span>
            </button>
          ))}
        </DropdownContent>
      </Dropdown>

      {/* Район — disabled пока не выбран регион */}
      <Dropdown>
        <DropdownTrigger asChild>
          <TriggerButton
            label={districtLabel}
            active={Boolean(districtId)}
            data-testid="district-trigger"
            disabled={!regionId}
            title={!regionId ? t('filters.regionRequired') : undefined}
          />
        </DropdownTrigger>
        <DropdownContent align="start" className="max-h-[320px] w-[240px] overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => onChange({ regionId, districtId: undefined })}
            className={cn(
              'flex w-full items-center rounded-lg px-3 py-[9px] text-left text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
              !districtId && 'bg-mint',
            )}
          >
            {t('filters.allDistricts')}
          </button>
          {regionDistricts.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange({ regionId, districtId: d.id })}
              className={cn(
                'flex w-full items-center rounded-lg px-3 py-[9px] text-left text-[14.5px] font-semibold text-ink transition-colors hover:bg-mint',
                districtId === d.id && 'bg-mint',
              )}
              data-testid={`district-option-${d.id}`}
            >
              <span className="truncate">{d.name}</span>
            </button>
          ))}
        </DropdownContent>
      </Dropdown>
    </div>
  );
}
