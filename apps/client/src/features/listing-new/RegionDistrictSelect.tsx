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
  DropdownItem,
} from '@/components/ui/dropdown';
import { TriggerButton } from '@/features/search/TriggerButton';
import type { Region, District } from '@/lib/mock/types';

export interface RegionDistrictSelectProps {
  regions: Region[];
  districts: District[];
  regionId?: string;
  districtId?: string;
  onChange: (next: { regionId?: string; districtId?: string }) => void;
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
          {/* DropdownItem (Radix Item): меню закрывается по выбору — сырой <button> не закрывал. */}
          <DropdownItem
            onSelect={() => onChange({ regionId: undefined, districtId: undefined })}
            selected={!regionId}
            className="text-[14.5px]"
          >
            {t('filters.allRegions')}
          </DropdownItem>
          {regions.map((r) => (
            <DropdownItem
              key={r.id}
              onSelect={() => onChange({ regionId: r.id, districtId: undefined })}
              selected={regionId === r.id}
              className="text-[14.5px]"
              data-testid={`region-option-${r.id}`}
            >
              {r.name}
            </DropdownItem>
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
          <DropdownItem
            onSelect={() => onChange({ regionId, districtId: undefined })}
            selected={!districtId}
            className="text-[14.5px]"
          >
            {t('filters.allDistricts')}
          </DropdownItem>
          {regionDistricts.map((d) => (
            <DropdownItem
              key={d.id}
              onSelect={() => onChange({ regionId, districtId: d.id })}
              selected={districtId === d.id}
              className="text-[14.5px]"
              data-testid={`district-option-${d.id}`}
            >
              {d.name}
            </DropdownItem>
          ))}
        </DropdownContent>
      </Dropdown>
    </div>
  );
}
