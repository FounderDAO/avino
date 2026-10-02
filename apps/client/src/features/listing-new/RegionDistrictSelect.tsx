/**
 * RegionDistrictSelect — контролируемый каскадный компонент «Регион → Район».
 *
 * Чистый контролируемый ввод: не читает URL, не управляет роутером.
 * Донор паттерна — FilterBar (два Dropdown-пилюли, фильтрация districts.filter).
 *
 * Подписи полей — `listingNew.fields.region.label` / `fields.district.label`:
 * это ЕДИНСТВЕННОЕ место, где задано название поля (лейбл, предупреждение шага,
 * подсказка у заблокированного района, серверные ошибки публикации), так что
 * переименование «Регион» → «Город» — правка одной i18n-строки.
 *
 * `required` рисует звёздочку; `regionError` / `districtError` — красную рамку,
 * текст ошибки под полем и aria-invalid (валидация живёт в родителе).
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
  /** Поля обязательны — показать звёздочку у подписей. */
  required?: boolean;
  /** Текст ошибки под «Регионом» (подсветка поля). */
  regionError?: string;
  /** Текст ошибки под «Районом» (подсветка поля). */
  districtError?: string;
}

/** Звёздочка обязательного поля (декоративная — смысл несёт текст ошибки). */
function RequiredMark() {
  return (
    <span aria-hidden className="text-red">
      {' '}
      *
    </span>
  );
}

export function RegionDistrictSelect({
  regions,
  districts,
  regionId,
  districtId,
  onChange,
  required,
  regionError,
  districtError,
}: RegionDistrictSelectProps) {
  const t = useTranslations('listingNew');
  const uid = React.useId();
  // id — только у текстов ошибок. Самим триггерам id НЕ задаём: его выставляет
  // Radix (на него ссылается aria-labelledby меню), а имя кнопки собираем через
  // aria-label «Поле: значение».
  const ids = {
    regionError: `${uid}-region-error`,
    districtError: `${uid}-district-error`,
  };

  const regionTitle = t('fields.region.label');
  const districtTitle = t('fields.district.label');
  const placeholder = t('fields.selectPlaceholder');

  const selectedRegion = regions.find((r) => r.id === regionId);

  // Список районов, отфильтрованных по выбранному региону.
  const regionDistricts = regionId
    ? districts.filter((d) => d.regionId === regionId)
    : [];

  const selectedDistrict = regionId
    ? districts.find((d) => d.id === districtId)
    : undefined;

  const errorClass = 'border-red hover:border-red';

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-4">
      {/* Регион */}
      <div>
        <span className="mb-[7px] block text-[13px] font-bold">
          {regionTitle}
          {required && <RequiredMark />}
        </span>
        <Dropdown>
          <DropdownTrigger asChild>
            <TriggerButton
              label={selectedRegion?.name ?? placeholder}
              active={Boolean(regionId)}
              data-testid="region-trigger"
              aria-label={`${regionTitle}: ${selectedRegion?.name ?? placeholder}`}
              aria-invalid={regionError ? true : undefined}
              aria-describedby={regionError ? ids.regionError : undefined}
              className={regionError ? errorClass : undefined}
            />
          </DropdownTrigger>
          <DropdownContent align="start" className="max-h-[320px] w-[240px] overflow-y-auto p-2">
            {/* DropdownItem (Radix Item): меню закрывается по выбору — сырой <button> не закрывал. */}
            <DropdownItem
              onSelect={() => onChange({ regionId: undefined, districtId: undefined })}
              selected={!regionId}
              className="text-[14.5px]"
            >
              {t('fields.notSelected')}
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
        {regionError && (
          <p id={ids.regionError} className="mt-1.5 text-[12.5px] font-semibold text-red">
            {regionError}
          </p>
        )}
      </div>

      {/* Район — disabled пока не выбран регион */}
      <div>
        <span className="mb-[7px] block text-[13px] font-bold">
          {districtTitle}
          {required && <RequiredMark />}
        </span>
        <Dropdown>
          <DropdownTrigger asChild>
            <TriggerButton
              label={selectedDistrict?.name ?? placeholder}
              active={Boolean(districtId)}
              data-testid="district-trigger"
              disabled={!regionId}
              title={
                !regionId
                  ? t('fields.district.needsParent', { field: regionTitle })
                  : undefined
              }
              aria-label={`${districtTitle}: ${selectedDistrict?.name ?? placeholder}`}
              aria-invalid={districtError ? true : undefined}
              aria-describedby={districtError ? ids.districtError : undefined}
              className={districtError ? errorClass : undefined}
            />
          </DropdownTrigger>
          <DropdownContent align="start" className="max-h-[320px] w-[240px] overflow-y-auto p-2">
            <DropdownItem
              onSelect={() => onChange({ regionId, districtId: undefined })}
              selected={!districtId}
              className="text-[14.5px]"
            >
              {t('fields.notSelected')}
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
        {districtError && (
          <p id={ids.districtError} className="mt-1.5 text-[12.5px] font-semibold text-red">
            {districtError}
          </p>
        )}
      </div>
    </div>
  );
}
