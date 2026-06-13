import { describe, it, expect } from 'vitest';
import { circleFromBounds, MIN_RADIUS_M, MAX_RADIUS_M } from './geo';
import type { LatLngBounds } from './geo';

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
