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

it('toAppliedRange: значения на краях домена → undefined (без границы)', () => {
  const domain = { min: 0, max: 1000 };
  expect(toAppliedRange({ min: 0, max: 1000 }, domain)).toEqual({ priceMin: undefined, priceMax: undefined });
  expect(toAppliedRange({ min: 200, max: 800 }, domain)).toEqual({ priceMin: 200, priceMax: 800 });
  expect(toAppliedRange({ min: 0, max: 800 }, domain)).toEqual({ priceMin: undefined, priceMax: 800 });
});
