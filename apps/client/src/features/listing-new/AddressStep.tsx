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
import { PickMap, type Coords, type MapFocus } from './PickMap';
import type { District } from '@/lib/mock/types';

/** Стабильная ссылка — адрес-пикеру районы не нужны (только адреса Yandex). */
const NO_DISTRICTS: District[] = [];

export interface AddressStepProps {
  address: string;
  coords: Coords | null;
  onAddressChange: (v: string) => void;
  onCoordsChange: (c: Coords | null) => void;
  /** Название выбранного региона — при смене карта мягко центрируется на нём. */
  regionName?: string;
  /** Название выбранного района (уточняет центр/zoom). */
  districtName?: string;
  locale: string;
}

export function AddressStep({
  address,
  coords,
  onAddressChange,
  onCoordsChange,
  regionName,
  districtName,
  locale,
}: AddressStepProps) {
  const t = useTranslations('listingNew');
  const tSearch = useTranslations('search');
  const [suggestActive, setSuggestActive] = React.useState(false);
  const [mapFocus, setMapFocus] = React.useState<MapFocus | null>(null);
  // Против гонки геокодов при быстрой смене региона/района.
  const focusSeq = React.useRef(0);
  const firstFocus = React.useRef(true);

  // Смена региона/района → геокодим название и центрируем карту (метку не ставим).
  React.useEffect(() => {
    const first = firstFocus.current;
    firstFocus.current = false;
    if (!regionName) return;
    // При монтировании с уже выбранной точкой карту не дёргаем (edit / возврат на шаг).
    if (first && coords) return;
    const query = districtName ? `${regionName}, ${districtName}` : regionName;
    const seq = ++focusSeq.current;
    geocodeToPoint(query, locale).then((p) => {
      if (p && seq === focusSeq.current) {
        setMapFocus({ coords: p.coords, zoom: districtName ? 12 : 9 });
      }
    });
    // coords нужен только на первом запуске; смена точки не должна перегеокодировать регион.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionName, districtName, locale]);

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
          focus={mapFocus}
          locale={locale}
        />
      </div>
    </div>
  );
}
