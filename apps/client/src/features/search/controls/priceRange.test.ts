import { clamp, niceStep, toAppliedRange } from './priceRange';

it('clamp ограничивает значение доменом', () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-3, 0, 10)).toBe(0);
  expect(clamp(99, 0, 10)).toBe(10);
});

it('niceStep ≈ 1/100 ширины, не меньше 1', () => {
  expect(niceStep({ min: 0, max: 1000 })).toBe(10);
  expect(niceStep({ min: 0, max: 50 })).toBe(1);
});

it('toAppliedRange: null → undefined (без границы)', () => {
  expect(toAppliedRange({ min: null, max: null })).toEqual({ priceMin: undefined, priceMax: undefined });
  expect(toAppliedRange({ min: 200, max: 800 })).toEqual({ priceMin: 200, priceMax: 800 });
  expect(toAppliedRange({ min: null, max: 800 })).toEqual({ priceMin: undefined, priceMax: 800 });
});
