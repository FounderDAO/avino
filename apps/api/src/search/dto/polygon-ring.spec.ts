import { parsePolygonRing } from './polygon-ring.util';

/**
 * Unit-тесты хелпера {@link parsePolygonRing} (TASK-193). Не требуют БД.
 * Покрывают: валидный ввод, слишком мало вершин, нечисловые координаты,
 * выход за диапазон lat/lng.
 */
describe('parsePolygonRing (unit)', () => {
  it('parses a valid 4-vertex square correctly', () => {
    const result = parsePolygonRing(
      '41.30,69.27;41.30,69.29;41.32,69.29;41.32,69.27',
    );
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ lat: 41.3, lng: 69.27 });
    expect(result[3]).toEqual({ lat: 41.32, lng: 69.27 });
  });

  it('parses exactly 3 vertices (minimum valid ring)', () => {
    const result = parsePolygonRing('41.30,69.27;41.30,69.29;41.32,69.28');
    expect(result).toHaveLength(3);
  });

  it('throws for fewer than 3 vertices', () => {
    expect(() => parsePolygonRing('41.30,69.27;41.30,69.29')).toThrow(
      /at least 3 vertices/,
    );
  });

  it('throws for a single vertex', () => {
    expect(() => parsePolygonRing('41.30,69.27')).toThrow(/at least 3 vertices/);
  });

  it('throws for empty string', () => {
    expect(() => parsePolygonRing('')).toThrow(/at least 3 vertices/);
  });

  it('throws for non-numeric lat', () => {
    expect(() =>
      parsePolygonRing('abc,69.27;41.30,69.29;41.32,69.28'),
    ).toThrow(/non-numeric/);
  });

  it('throws for non-numeric lng', () => {
    expect(() =>
      parsePolygonRing('41.30,xyz;41.30,69.29;41.32,69.28'),
    ).toThrow(/non-numeric/);
  });

  it('throws for lat out of range (> 90)', () => {
    expect(() =>
      parsePolygonRing('91.00,69.27;41.30,69.29;41.32,69.28'),
    ).toThrow(/lat.*out of range/);
  });

  it('throws for lat out of range (< -90)', () => {
    expect(() =>
      parsePolygonRing('-91.00,69.27;41.30,69.29;41.32,69.28'),
    ).toThrow(/lat.*out of range/);
  });

  it('throws for lng out of range (> 180)', () => {
    expect(() =>
      parsePolygonRing('41.30,181.00;41.30,69.29;41.32,69.28'),
    ).toThrow(/lng.*out of range/);
  });

  it('throws for lng out of range (< -180)', () => {
    expect(() =>
      parsePolygonRing('41.30,-181.00;41.30,69.29;41.32,69.28'),
    ).toThrow(/lng.*out of range/);
  });

  it('throws for malformed pair (missing lng)', () => {
    // "41.30" without comma — parsed as two-element split on "," gives ["41.30"],
    // which has length 1, not 2 → throws.
    expect(() =>
      parsePolygonRing('41.30;41.30,69.29;41.32,69.28'),
    ).toThrow();
  });

  it('accepts boundary values at extremes (lat=90, lng=180)', () => {
    const result = parsePolygonRing('90.00,180.00;-90.00,-180.00;0.00,0.00');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ lat: 90, lng: 180 });
  });
});
