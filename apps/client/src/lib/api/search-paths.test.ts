/**
 * Тесты построителей путей гео-поиска: /search/bounds и /search/polygon обязаны
 * получать ПОЛНЫЙ набор фильтров §9 (Фаза 2), а не урезанное подмножество —
 * иначе выдача карты игнорирует amenities/parking/мультитип и т.д.
 */
import { describe, it, expect } from 'vitest';
import { boundsSearchPath, polygonSearchPath, searchPagePath } from './listings';
import { PARKING_TYPES } from '@/lib/mock/types';
import type { LatLngBounds } from '@/lib/geo';

const bounds: LatLngBounds = { swLat: 41.2, swLng: 69.1, neLat: 41.4, neLng: 69.4 };

// Удобства — динамический справочник (Task 5, GET /amenities); в тестах путей
// достаточно произвольного кода.
const TEST_AMENITY = 'INTERNET';

describe('boundsSearchPath', () => {
  it('передаёт bbox и фильтры Фазы 2', () => {
    const path = boundsSearchPath(
      {
        tx: 'SALE',
        types: ['APARTMENT', 'HOUSE'],
        amenities: [TEST_AMENITY],
        parkingTypes: [PARKING_TYPES[0]],
        bathroomsMin: 2,
        areaMin: 50,
      },
      bounds,
      100,
    );
    expect(path.startsWith('/search/bounds?')).toBe(true);
    const qs = new URLSearchParams(path.split('?')[1]);
    expect(qs.get('sw_lat')).toBe('41.2');
    expect(qs.get('ne_lng')).toBe('69.4');
    expect(qs.get('transaction_type')).toBe('SALE');
    expect(qs.getAll('property_type')).toEqual(['APARTMENT', 'HOUSE']);
    expect(qs.getAll('amenities')).toEqual([TEST_AMENITY]);
    expect(qs.getAll('parking_type')).toEqual([PARKING_TYPES[0]]);
    expect(qs.get('bathrooms_min')).toBe('2');
    expect(qs.get('area_min')).toBe('50');
    expect(qs.get('limit')).toBe('100');
  });
});

describe('polygonSearchPath', () => {
  it('передаёт кольцо и фильтры', () => {
    const path = polygonSearchPath(
      { tx: 'RENT', amenities: [TEST_AMENITY] },
      '41.2,69.1;41.3,69.2;41.25,69.3',
      100,
    );
    expect(path.startsWith('/search/polygon?')).toBe(true);
    const qs = new URLSearchParams(path.split('?')[1]);
    expect(qs.get('points')).toBe('41.2,69.1;41.3,69.2;41.25,69.3');
    expect(qs.getAll('amenities')).toEqual([TEST_AMENITY]);
  });
});

describe('searchPagePath', () => {
  it('передаёт cursor и фильтры', () => {
    const path = searchPagePath({ tx: 'SALE', roomsMin: 2 }, 24, 'CURSOR123');
    expect(path.startsWith('/search?')).toBe(true);
    const qs = new URLSearchParams(path.split('?')[1]);
    expect(qs.get('cursor')).toBe('CURSOR123');
    expect(qs.get('rooms_min')).toBe('2');
    expect(qs.get('limit')).toBe('24');
  });
});
