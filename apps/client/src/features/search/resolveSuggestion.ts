'use client';

/**
 * resolveSuggestion — выбранная подсказка → circle для URL-поиска.
 * Геокодит значение через ymaps.geocode, берёт boundedBy первого результата и
 * переводит его в circle (circleFromBounds). Любая осечка (нет результата, нет
 * bbox, сетевой сбой) → null: вызывающий падает на текстовый поиск без гео.
 */
import { loadYmaps } from '@/features/map/useYmaps';
import { circleFromBounds } from '@/lib/geo';
import type { LatLngBounds } from '@/lib/geo';
import type { RadiusCircle } from '@/lib/mock/types';

export interface ResolvedGeo {
  label: string;
  circle: RadiusCircle;
}

export async function resolveSuggestion(value: string): Promise<ResolvedGeo | null> {
  try {
    const ymaps = await loadYmaps();
    const res = await ymaps.geocode(value, { results: 1 });
    const obj = res.geoObjects.get(0);
    if (!obj) return null;

    const bounded = obj.properties.get('boundedBy') as
      | [[number, number], [number, number]]
      | undefined;
    // Yandex 2.1 latlong: boundedBy = [[swLat, swLng], [neLat, neLng]].
    const bounds: LatLngBounds | null = bounded
      ? { swLat: bounded[0][0], swLng: bounded[0][1], neLat: bounded[1][0], neLng: bounded[1][1] }
      : null;

    const circle = circleFromBounds(bounds);
    if (!circle) return null;

    const label = (obj.getAddressLine?.() as string | undefined) || value;
    return { label, circle };
  } catch {
    return null;
  }
}
