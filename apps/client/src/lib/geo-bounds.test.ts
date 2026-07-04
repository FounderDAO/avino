/**
 * Тесты bbox-хелперов URL (?sw_lat=&sw_lng=&ne_lat=&ne_lng=) — viewport-режим
 * /search (Zillow): парсинг из searchParams и запись в URLSearchParams.
 */
import { describe, it, expect } from 'vitest';
import { parseBoundsParams, setBoundsParams, BBOX_PARAM_KEYS } from './geo';

describe('parseBoundsParams', () => {
  it('валидные строки → LatLngBounds', () => {
    expect(parseBoundsParams('41.2', '69.1', '41.4', '69.4')).toEqual({
      swLat: 41.2, swLng: 69.1, neLat: 41.4, neLng: 69.4,
    });
  });

  it('неполный набор → null', () => {
    expect(parseBoundsParams('41.2', '69.1', '41.4', undefined)).toBe(null);
    expect(parseBoundsParams(undefined, undefined, undefined, undefined)).toBe(null);
  });

  it('NaN / вне WGS84 / вырожденный (sw ≥ ne) → null', () => {
    expect(parseBoundsParams('x', '69.1', '41.4', '69.4')).toBe(null);
    expect(parseBoundsParams('-91', '69.1', '41.4', '69.4')).toBe(null);
    expect(parseBoundsParams('41.4', '69.1', '41.2', '69.4')).toBe(null);
    expect(parseBoundsParams('41.2', '69.4', '41.4', '69.1')).toBe(null);
  });
});

describe('setBoundsParams', () => {
  it('пишет 4 параметра, округляя до 5 знаков', () => {
    const p = new URLSearchParams('tx=SALE');
    setBoundsParams(p, {
      swLat: 41.123456789, swLng: 69.1, neLat: 41.4, neLng: 69.400009,
    });
    expect(p.get('sw_lat')).toBe('41.12346');
    expect(p.get('sw_lng')).toBe('69.1');
    expect(p.get('ne_lat')).toBe('41.4');
    expect(p.get('ne_lng')).toBe('69.40001');
    expect(p.get('tx')).toBe('SALE'); // существующие параметры не трогаем
  });

  it('BBOX_PARAM_KEYS перечисляет ровно эти 4 ключа', () => {
    expect([...BBOX_PARAM_KEYS]).toEqual(['sw_lat', 'sw_lng', 'ne_lat', 'ne_lng']);
  });
});
