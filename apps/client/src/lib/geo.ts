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

// ─── Карта по видимой области (bounds) и рисование территории (polygon) ───
//
// Используется новым поиском по карте (TASK-152, features/map). Координаты
// храним как `[lat, lng]` — порядок Yandex Maps (geographical), поэтому
// конвертация map↔helpers тривиальна. Точная фильтрация по территории —
// серверная (GET /search/polygon, ST_Within, TASK-193): кольцо обводки
// сериализуется в параметр `points` через {@link serializePolygonRing}.

/** Точка `[lat, lng]` (порядок Yandex Maps). */
export type LatLng = [number, number];

/**
 * Прямоугольная область карты (углы bbox, WGS84). Соответствует query-параметрам
 * `GET /api/v1/search/bounds`: `sw_*` — юго-западный угол, `ne_*` — северо-восточный.
 */
export interface LatLngBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

/** true, если bbox валиден и не вырожден (sw строго южнее/западнее ne). */
export function isValidBounds(b: LatLngBounds | null | undefined): b is LatLngBounds {
  if (!b) return false;
  const vals = [b.swLat, b.swLng, b.neLat, b.neLng];
  if (vals.some((v) => !Number.isFinite(v))) return false;
  if (b.swLat < -90 || b.neLat > 90 || b.swLng < -180 || b.neLng > 180) return false;
  // Бэкенд не поддерживает bbox через антимеридиан → требуем sw < ne (API.md §10).
  return b.swLat < b.neLat && b.swLng < b.neLng;
}

/** Описанный вокруг полигона bbox (мин/макс по lat и lng). null — если <3 точек. */
export function polygonBounds(points: LatLng[]): LatLngBounds | null {
  if (!points || points.length < 3) return null;
  let swLat = Infinity;
  let swLng = Infinity;
  let neLat = -Infinity;
  let neLng = -Infinity;
  for (const [lat, lng] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < swLat) swLat = lat;
    if (lat > neLat) neLat = lat;
    if (lng < swLng) swLng = lng;
    if (lng > neLng) neLng = lng;
  }
  return { swLat, swLng, neLat, neLng };
}

/**
 * Точка внутри полигона (ray casting). Полигон — кольцо `[lat, lng]`; замыкающую
 * точку дублировать не обязательно. Для небольших площадей (город) плоское
 * приближение lat/lng точно достаточно — серверная точность даёт ST_Within.
 */
export function pointInPolygon(lat: number, lng: number, points: LatLng[]): boolean {
  if (!points || points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [yi, xi] = points[i];
    const [yj, xj] = points[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Дистанция между двумя точками в метрах (haversine). */
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Прямоугольная область → круг: центр = середина bbox, радиус = половина
 * диагонали (clamp 250..50000). Невалидный/вырожденный bbox → null (тогда
 * вызывающий падает на текстовый поиск без гео).
 */
export function circleFromBounds(bounds: LatLngBounds | null): RadiusCircle | null {
  if (!isValidBounds(bounds)) return null;
  const lat = (bounds.swLat + bounds.neLat) / 2;
  const lng = (bounds.swLng + bounds.neLng) / 2;
  const diagM = haversineM(bounds.swLat, bounds.swLng, bounds.neLat, bounds.neLng);
  return { lat, lng, radiusM: clampRadius(diagM / 2) };
}

// ─── Сериализация кольца территории для GET /search/polygon (TASK-193) ───

/**
 * Верхняя граница числа вершин в query-параметре `points`. Freehand-обводка
 * может дать сотни точек (несмотря на прореживание по шагу на карте) — ограничиваем
 * длину query и стоимость серверного ST_Within равномерной децимацией.
 */
export const MAX_POLYGON_VERTICES = 120;

/** Округление координаты до 6 знаков (≈0.1 м) без хвостовых нулей. */
function roundCoord(v: number): string {
  return String(Math.round(v * 1e6) / 1e6);
}

/** Равномерно прореживает кольцо до `max` вершин, сохраняя порядок обхода. */
function decimateRing(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  return out;
}

/**
 * Кольцо обводки `[lat, lng]` → параметр `points` для `GET /api/v1/search/polygon`:
 * строка `lat,lng` пар через `;` (бэкенд замыкает кольцо сам, ST_MakePolygon).
 *
 * Требует ≥ 3 валидных вершины (WGS84); иначе — `null` (вызывающий не делает
 * запрос и оставляет прежнюю выдачу). Длинная обводка прореживается до
 * {@link MAX_POLYGON_VERTICES}. Координаты округляются до 6 знаков.
 */
export function serializePolygonRing(
  points: LatLng[],
  maxVertices = MAX_POLYGON_VERTICES,
): string | null {
  if (!points || points.length < 3) return null;
  for (const [lat, lng] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  }
  const ring = decimateRing(points, Math.max(3, maxVertices));
  if (ring.length < 3) return null;
  return ring.map(([lat, lng]) => `${roundCoord(lat)},${roundCoord(lng)}`).join(';');
}

/**
 * Обратный к {@link serializePolygonRing}: строка `lat,lng;lat,lng;…` →
 * массив вершин `[lat, lng]`. Возвращает `null`, если вершин < 3 или любая
 * пара невалидна/вне WGS84 (симметрично сериализатору — вызывающий тогда
 * не восстанавливает территорию и остаётся на скалярной выдаче).
 */
export function deserializePolygonRing(
  raw: string | null | undefined,
): LatLng[] | null {
  if (!raw) return null;
  const out: LatLng[] = [];
  for (const pair of raw.split(';')) {
    const parts = pair.split(',');
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    out.push([lat, lng]);
  }
  return out.length >= 3 ? out : null;
}

// ─── bbox видимой области в URL /search (viewport-режим, Zillow) ───
//
// Область карты зеркалится в query (?sw_lat=&sw_lng=&ne_lat=&ne_lng=) shallow
// history.replaceState — refresh/шеринг ссылки сохраняют вид. Имена совпадают
// с параметрами GET /api/v1/search/bounds.

/** Ключи bbox-параметров URL (для записи/очистки одним списком). */
export const BBOX_PARAM_KEYS = ['sw_lat', 'sw_lng', 'ne_lat', 'ne_lng'] as const;

/**
 * Query-параметры `?sw_lat=&sw_lng=&ne_lat=&ne_lng=` → {@link LatLngBounds} | null.
 * Невалидные/неполные/вырожденные значения → null (страница молча падает на
 * обычную выдачу по фильтрам — как parseCircleParams выше).
 */
export function parseBoundsParams(
  swLat: string | undefined,
  swLng: string | undefined,
  neLat: string | undefined,
  neLng: string | undefined,
): LatLngBounds | null {
  if (!swLat || !swLng || !neLat || !neLng) return null;
  const b: LatLngBounds = {
    swLat: Number(swLat),
    swLng: Number(swLng),
    neLat: Number(neLat),
    neLng: Number(neLng),
  };
  return isValidBounds(b) ? b : null;
}

/** Координата bbox для URL: 5 знаков (~1 м) без хвостовых нулей. */
function roundBboxCoord(v: number): string {
  return String(Math.round(v * 1e5) / 1e5);
}

/** Пишет bbox в query-параметры (мутирует переданный URLSearchParams). */
export function setBoundsParams(params: URLSearchParams, b: LatLngBounds): void {
  params.set('sw_lat', roundBboxCoord(b.swLat));
  params.set('sw_lng', roundBboxCoord(b.swLng));
  params.set('ne_lat', roundBboxCoord(b.neLat));
  params.set('ne_lng', roundBboxCoord(b.neLng));
}
