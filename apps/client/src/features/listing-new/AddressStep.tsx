'use client';

/**
 * AddressStep — шаг «Адрес» визарда: автокомплит адреса (Yandex Suggest, та же
 * связка SearchAutocomplete + useGeoSuggest, что и на /search) + реальная
 * Yandex-карта (PickMap) с перетаскиваемой точкой.
 *
 * Двусторонняя синхронизация:
 *  - выбор подсказки / Enter → геокодим адрес → ставим точку и центрируем карту;
 *  - клик / перетаскивание точки → обратный геокод → подставляем адрес.
 *
 * Районы тут не нужны (адрес объекта — точный, а не «район»), поэтому в
 * useGeoSuggest отдаём пустой список — остаются только адреса Yandex.
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { SearchAutocomplete } from '@/features/search/SearchAutocomplete';
import { useGeoSuggest, type Suggestion } from '@/features/search/useGeoSuggest';
import { geocodeToPoint } from '@/features/map/geocode';
import { PickMap, type Coords } from './PickMap';
import type { District } from '@/lib/mock/types';

/** Стабильная ссылка — адрес-пикеру районы не нужны (только адреса Yandex). */
const NO_DISTRICTS: District[] = [];

export interface AddressStepProps {
  address: string;
  coords: Coords | null;
  onAddressChange: (v: string) => void;
  onCoordsChange: (c: Coords | null) => void;
  locale: string;
}

export function AddressStep({
  address,
  coords,
  onAddressChange,
  onCoordsChange,
  locale,
}: AddressStepProps) {
  const t = useTranslations('listingNew');
  const tSearch = useTranslations('search');
  const [suggestActive, setSuggestActive] = React.useState(false);

  const { items, loading } = useGeoSuggest(address, {
    enabled: suggestActive,
    districts: NO_DISTRICTS,
    locale,
  });

  // Выбор подсказки: показываем title в поле и геокодим value → точка на карте.
  const handleSelect = (s: Suggestion) => {
    onAddressChange(s.title);
    geocodeToPoint(s.value, locale).then((p) => {
      if (p) onCoordsChange(p.coords);
    });
  };

  // Enter без выбора подсказки: геокодим сырой текст (текст пользователя сохраняем).
  const handleSubmitRaw = (text: string) => {
    if (!text.trim()) return;
    geocodeToPoint(text, locale).then((p) => {
      if (p) onCoordsChange(p.coords);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-[7px] block text-[13px] font-bold">{t('fields.address.label')}</label>
        <SearchAutocomplete
          value={address}
          onChange={onAddressChange}
          onSelect={handleSelect}
          onSubmitRaw={handleSubmitRaw}
          onActiveChange={setSuggestActive}
          items={items}
          loading={loading}
          placeholder={t('fields.address.placeholder')}
          ariaLabel={t('fields.address.label')}
          labels={{
            districts: tSearch('filters.suggestGroupDistricts'),
            addresses: tSearch('filters.suggestGroupAddresses'),
            empty: tSearch('filters.suggestEmpty'),
          }}
          className="w-full"
          inputClassName="pl-[42px]"
        />
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{t('fields.address.hint')}</p>
      </div>
      <div>
        <label className="mb-[7px] block text-[13px] font-bold">{t('fields.mapPoint')}</label>
        <PickMap
          value={coords}
          onChange={onCoordsChange}
          onAddressResolve={onAddressChange}
          locale={locale}
        />
      </div>
    </div>
  );
}
