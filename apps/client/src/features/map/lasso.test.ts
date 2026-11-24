import { describe, it, expect } from 'vitest';
import { appendPoint, decimatePath, svgPath, ZONE_TARGET_VERTICES } from './lasso';

describe('lasso — рисование зоны как в приложении', () => {
  it('длинный путь прореживается до ~32 вершин равномерным шагом', () => {
    const path = Array.from({ length: 320 }, (_, i) => i);
    const out = decimatePath(path);
    expect(out.length).toBe(ZONE_TARGET_VERTICES);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(10);
  });

  it('короткий путь не трогаем', () => {
    expect(decimatePath([1, 2, 3])).toEqual([1, 2, 3]);
    expect(decimatePath([])).toEqual([]);
  });

  it('точка ближе 2px к предыдущей не добавляется', () => {
    const p1 = appendPoint([], [10, 10]);
    expect(appendPoint(p1, [11, 10])).toBe(p1);
    expect(appendPoint(p1, [13, 10])).toEqual([[10, 10], [13, 10]]);
  });

  it('svgPath: открытая линия и замкнутый контур', () => {
    expect(svgPath([[0, 0], [5, 5]])).toBe('M0,0L5,5');
    expect(svgPath([[0, 0], [5, 5], [0, 5]], true)).toBe('M0,0L5,5L0,5Z');
    expect(svgPath([])).toBe('');
  });
});
