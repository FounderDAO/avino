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

/** Обратное геокодирование: координаты → строка адреса (или null). */
export async function reverseGeocode(coords: LatLng, locale?: string): Promise<string | null> {
  try {
    const ymaps = await loadYmaps(locale);
    const res = await ymaps.geocode(coords, { results: 1 });
    const obj = res.geoObjects.get(0);
    const line = obj?.getAddressLine?.() as string | undefined;
    return line || null;
  } catch {
    return null;
  }
}
