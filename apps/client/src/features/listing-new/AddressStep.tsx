'use client';

/**
 * AddressStep — шаг «Адрес» визарда: автокомплит адреса (Yandex Suggest, та же
 * связка SearchAutocomplete + useGeoSuggest, что и на /search) + реальная
 * Yandex-карта (PickMap) с перетаскиваемой точкой.
 *
 * Двусторонняя синхронизация:
 *  - выбор подсказки / Enter → геокодим адрес → ставим точку и центрируем карту;
 *  - клик / перетаскивание точки → обратный геокод → подставляем адрес, а если
 *    переданы справочники (`regions`/`districts`) и `onLocationFromMap` — ещё и
 *    регион/район (сопоставление — чистая функция geoMatch.ts).
 *
 * Районы тут не нужны (адрес объекта — точный, а не «район»), поэтому в
 * useGeoSuggest отдаём пустой список — остаются только адреса Yandex.
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { SearchAutocomplete } from '@/features/search/SearchAutocomplete';
import { useGeoSuggest, type Suggestion } from '@/features/search/useGeoSuggest';
import { geocodeToPoint, type ReverseGeocodeResult } from '@/features/map/geocode';
import { matchRegionDistrict, resolveMapLocation } from '@/features/map/geoMatch';
import { PickMap, type Coords, type MapFocus } from './PickMap';
import type { District, Region } from '@/lib/mock/types';

/** Стабильная ссылка — адрес-пикеру районы не нужны (только адреса Yandex). */
const NO_DISTRICTS: District[] = [];

/** Ключ пары «регион|район» — для подавления фокуса карты (см. expectedFromMap). */
const focusKey = (regionName?: string, districtName?: string): string =>
  `${regionName ?? ''}|${districtName ?? ''}`;

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
  /** Пометить поле «Адрес» как обязательное (звёздочка + aria-required). */
  required?: boolean;
  /** Текст ошибки под полем «Адрес» (красная рамка + aria-invalid). */
  addressError?: string;
  /**
   * Справочники и текущий выбор — нужны, чтобы по точке на карте определить
   * регион/район. Опциональны: без них (и без `onLocationFromMap`) карта, как и
   * раньше, подставляет только адрес.
   */
  regions?: Region[];
  districts?: District[];
  regionId?: string;
  districtId?: string;
  /** Точка на карте распознана как регион (+ район): выставить их в форме. */
  onLocationFromMap?: (next: { regionId: string; districtId?: string }) => void;
}

export function AddressStep({
  address,
  coords,
  onAddressChange,
  onCoordsChange,
  regionName,
  districtName,
  locale,
  required,
  addressError,
  regions,
  districts,
  regionId,
  districtId,
  onLocationFromMap,
}: AddressStepProps) {
  const t = useTranslations('listingNew');
  const tSearch = useTranslations('search');
  const [suggestActive, setSuggestActive] = React.useState(false);
  const [mapFocus, setMapFocus] = React.useState<MapFocus | null>(null);
  // Против гонки геокодов при быстрой смене региона/района.
  const focusSeq = React.useRef(0);
  const firstFocus = React.useRef(true);
  // Пара «регион|район», которую только что выставила САМА карта: эффект фокуса
  // ниже должен её пропустить (иначе карта отъедет от точки, которую поставил
  // пользователь). Храним ожидаемое значение, а не флаг: если выбор не изменился,
  // флаг «пропусти следующий» завис бы и съел настоящую смену региона.
  const expectedFromMap = React.useRef<string | null>(null);
  const errorId = React.useId();

  // Смена региона/района → геокодим название и центрируем карту (метку не ставим).
  React.useEffect(() => {
    const first = firstFocus.current;
    firstFocus.current = false;
    const fromMap = expectedFromMap.current === focusKey(regionName, districtName);
    expectedFromMap.current = null;
    // Регион/район пришли от карты — точка уже стоит, карту не дёргаем.
    if (fromMap) return;
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

  // Точка на карте → регион/район. Вызывается PickMap'ом только для последней
  // точки. Идёт мимо onChange селектов, поэтому автоподстановка «Регион, Район»
  // в родителе не срабатывает и не затирает точный адрес с карты.
  const handleMapLocation = (res: ReverseGeocodeResult) => {
    // Пользователь поставил точку — ещё не пришедший фокус региона уже не нужен.
    focusSeq.current += 1;
    if (!onLocationFromMap || !regions?.length) return;
    const match = matchRegionDistrict(res.components, regions, districts ?? []);
    const next = resolveMapLocation({ regionId, districtId }, match);
    if (!next) return;
    expectedFromMap.current = focusKey(
      regions.find((r) => r.id === next.regionId)?.name,
      (districts ?? []).find((d) => d.id === next.districtId)?.name,
    );
    onLocationFromMap(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="mb-[7px] block text-[13px] font-bold">
          {t('fields.address.label')}
          {required && (
            <span aria-hidden className="text-red">
              {' '}
              *
            </span>
          )}
        </label>
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
          required={required}
          invalid={Boolean(addressError)}
          describedBy={addressError ? errorId : undefined}
        />
        {addressError ? (
          <p id={errorId} className="mt-1.5 text-[12.5px] font-semibold text-red">
            {addressError}
          </p>
        ) : (
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">{t('fields.address.hint')}</p>
        )}
      </div>
      <div>
        <label className="mb-[7px] block text-[13px] font-bold">{t('fields.mapPoint')}</label>
        <PickMap
          value={coords}
          onChange={onCoordsChange}
          onAddressResolve={onAddressChange}
          onLocationResolve={handleMapLocation}
          focus={mapFocus}
          locale={locale}
        />
      </div>
    </div>
  );
}
