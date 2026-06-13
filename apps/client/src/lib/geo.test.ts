import { describe, it, expect } from 'vitest';
import {
  circleFromBounds,
  serializePolygonRing,
  MIN_RADIUS_M,
  MAX_RADIUS_M,
  MAX_POLYGON_VERTICES,
} from './geo';
import type { LatLng, LatLngBounds } from './geo';

describe('circleFromBounds', () => {
  it('возвращает центр bbox и радиус ≈ половина диагонали', () => {
    const b: LatLngBounds = { swLat: 41.30, swLng: 69.24, neLat: 41.31, neLng: 69.25 };
    const c = circleFromBounds(b);
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(41.305, 5);
    expect(c!.lng).toBeCloseTo(69.245, 5);
    // ~1.1км по широте + ~0.84км по долготе → диагональ ~1.4км → радиус ~700м.
    expect(c!.radiusM).toBeGreaterThan(600);
    expect(c!.radiusM).toBeLessThan(800);
  });

  it('крошечный bbox (точный адрес) зажимается к MIN_RADIUS_M', () => {
    const b: LatLngBounds = { swLat: 41.3000, swLng: 69.2400, neLat: 41.3001, neLng: 69.2401 };
    expect(circleFromBounds(b)!.radiusM).toBe(MIN_RADIUS_M);
  });

  it('огромный bbox зажимается к MAX_RADIUS_M', () => {
    const b: LatLngBounds = { swLat: 40, swLng: 68, neLat: 42, neLng: 70 };
    expect(circleFromBounds(b)!.radiusM).toBe(MAX_RADIUS_M);
  });

  it('невалидный/вырожденный bbox → null', () => {
    expect(circleFromBounds(null)).toBeNull();
    expect(circleFromBounds({ swLat: 41.3, swLng: 69.2, neLat: 41.3, neLng: 69.2 })).toBeNull();
  });
});

describe('serializePolygonRing', () => {
  const square: LatLng[] = [
    [41.30, 69.27],
    [41.30, 69.29],
    [41.32, 69.29],
    [41.32, 69.27],
  ];

  it('кольцо ≥3 вершин → строка "lat,lng" пар через ";"', () => {
    expect(serializePolygonRing(square)).toBe('41.3,69.27;41.3,69.29;41.32,69.29;41.32,69.27');
  });

  it('< 3 вершин → null (запрос не делаем)', () => {
    expect(serializePolygonRing([])).toBeNull();
    expect(serializePolygonRing([[41.3, 69.27], [41.31, 69.28]])).toBeNull();
  });

  it('NaN / вне диапазона WGS84 → null', () => {
    expect(serializePolygonRing([[41.3, 69.27], [Number.NaN, 69.29], [41.32, 69.29]])).toBeNull();
    expect(serializePolygonRing([[41.3, 69.27], [91, 69.29], [41.32, 69.29]])).toBeNull();
    expect(serializePolygonRing([[41.3, 200], [41.3, 69.29], [41.32, 69.29]])).toBeNull();
  });

  it('округляет координаты до 6 знаков', () => {
    const out = serializePolygonRing([
      [41.123456789, 69.2],
      [41.3, 69.987654321],
      [41.32, 69.29],
    ]);
    expect(out).toBe('41.123457,69.2;41.3,69.987654;41.32,69.29');
  });

  it('длинная обводка прореживается до MAX_POLYGON_VERTICES', () => {
    // 500 валидных точек вокруг центра.
    const many: LatLng[] = Array.from({ length: 500 }, (_, i) => [
      41.3 + i * 1e-5,
      69.27 + i * 1e-5,
    ]);
    const out = serializePolygonRing(many);
    expect(out).not.toBeNull();
    expect(out!.split(';')).toHaveLength(MAX_POLYGON_VERTICES);
  });

  it('кольцо ровно из MAX вершин не прореживается', () => {
    const exact: LatLng[] = Array.from({ length: MAX_POLYGON_VERTICES }, (_, i) => [
      41.3 + i * 1e-5,
      69.27,
    ]);
    expect(serializePolygonRing(exact)!.split(';')).toHaveLength(MAX_POLYGON_VERTICES);
  });
});
