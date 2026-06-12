/**
 * Гео-утилиты радиусного поиска (TASK: радиус на карте /search).
 *
 * Круг живёт в URL query (?clat=&clng=&radius=) — как остальные фильтры
 * (URL — единственный источник истины, см. search/page.tsx). Здесь — парсинг
 * и валидация этих параметров + границы радиуса, согласованные с бэкендом
 * (GET /search/radius, API.md §10: radius_m 1..50000).
 */
import type { RadiusCircle } from '@/lib/mock/types';

/** Нижняя граница радиуса (м): клик без протяжки не должен давать «точку». */
export const MIN_RADIUS_M = 250;
/** Верхняя граница радиуса (м) — лимит бэкенда (API.md §10). */
export const MAX_RADIUS_M = 50_000;

/** Зажимает радиус в допустимые границы бэкенда. */
export function clampRadius(radiusM: number): number {
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(radiusM)));
}

/**
 * Параметры `?clat=&clng=&radius=` → {@link RadiusCircle} | null.
 * Невалидные/неполные значения (NaN, вне диапазонов WGS84, radius вне
 * 1..50000) → null: страница молча падает на обычный /search.
 */
export function parseCircleParams(
  clat: string | undefined,
  clng: string | undefined,
  radius: string | undefined,
): RadiusCircle | null {
  if (!clat || !clng || !radius) return null;
  const lat = Number(clat);
  const lng = Number(clng);
  const radiusM = Number(radius);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusM)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (radiusM < 1 || radiusM > MAX_RADIUS_M) return null;
  return { lat, lng, radiusM: Math.round(radiusM) };
}
