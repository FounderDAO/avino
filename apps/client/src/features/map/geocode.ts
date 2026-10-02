'use client';

/**
 * geocode — точечное геокодирование адреса через Yandex (для пикера адреса в
 * визарде «Разместить объявление»). Прямое (адрес → точка) и обратное
 * (точка → адрес). Ленивая загрузка SDK через loadYmaps. Любая осечка (нет
 * результата, нет геометрии, сетевой сбой, нет ключа) → null: вызывающий просто
 * остаётся без координат, шаг не падает.
 *
 * Отличие от resolveSuggestion (search): тот переводит bbox → circle для
 * радиус-поиска, здесь нужна ОДНА точка [lat, lng] + нормализованный адрес.
 */
import { loadYmaps } from '@/features/map/useYmaps';
import type { LatLng } from '@/lib/geo';
import type { AddressComponent } from './geoMatch';

export interface GeocodePoint {
  /** Координаты [lat, lng] (Yandex latlong-порядок). */
  coords: LatLng;
  /** Нормализованная строка адреса (getAddressLine) или исходный запрос. */
  address: string;
}

/** Прямое геокодирование: строка адреса → координаты + нормализованный адрес. */
export async function geocodeToPoint(value: string, locale?: string): Promise<GeocodePoint | null> {
  try {
    const ymaps = await loadYmaps(locale);
    const res = await ymaps.geocode(value, { results: 1 });
    const obj = res.geoObjects.get(0);
    if (!obj) return null;
    const c = obj.geometry?.getCoordinates?.() as [number, number] | undefined;
    if (!c) return null;
    const address = (obj.getAddressLine?.() as string | undefined) || value;
    return { coords: [c[0], c[1]], address };
  } catch {
    return null;
  }
}

/** Результат обратного геокода: строка адреса + компоненты (регион/район/…). */
export interface ReverseGeocodeResult {
  address: string;
  /** `GeocoderMetaData.Address.Components` — для сопоставления со справочником. */
  components: AddressComponent[];
}

/** Достаёт компоненты адреса из гео-объекта Yandex; любая осечка → []. */
function readComponents(obj: any): AddressComponent[] {
  try {
    const raw = obj?.properties?.get?.(
      'metaDataProperty.GeocoderMetaData.Address.Components',
    );
    if (Array.isArray(raw)) {
      const list = raw
        .filter((c) => c && typeof c.kind === 'string' && typeof c.name === 'string')
        .map((c) => ({ kind: c.kind as string, name: c.name as string }));
      if (list.length) return list;
    }
    // Фолбэк на методы GeocodeResult (если метаданные недоступны).
    const areas = (obj?.getAdministrativeAreas?.() ?? []) as string[];
    const localities = (obj?.getLocalities?.() ?? []) as string[];
    return [
      ...areas.map((name) => ({ kind: 'province', name })),
      ...localities.map((name) => ({ kind: 'locality', name })),
    ];
  } catch {
    return [];
  }
}

/**
 * Обратное геокодирование с компонентами адреса: координаты → строка адреса +
 * `{kind, name}[]` (province / area / locality / district …). Нужна визарду,
 * чтобы по точке на карте выставить ещё и регион/район (см. geoMatch.ts).
 */
export async function reverseGeocodeDetailed(
  coords: LatLng,
  locale?: string,
): Promise<ReverseGeocodeResult | null> {
  try {
    const ymaps = await loadYmaps(locale);
    const res = await ymaps.geocode(coords, { results: 1 });
    const obj = res.geoObjects.get(0);
    const line = obj?.getAddressLine?.() as string | undefined;
    if (!line) return null;
    return { address: line, components: readComponents(obj) };
  } catch {
    return null;
  }
}

/** Обратное геокодирование: координаты → строка адреса (или null). */
export async function reverseGeocode(coords: LatLng, locale?: string): Promise<string | null> {
  const res = await reverseGeocodeDetailed(coords, locale);
  return res?.address ?? null;
}
