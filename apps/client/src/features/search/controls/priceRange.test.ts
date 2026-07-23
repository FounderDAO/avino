import { it, expect } from 'vitest';
import { clamp, niceStep, toAppliedRange, niceCeil, toDisplayPrices, buildPriceHistogram } from './priceRange';

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

it('niceCeil округляет вверх до 2 значащих цифр', () => {
  expect(niceCeil(132000)).toBe(140000);
  expect(niceCeil(1000000)).toBe(1000000);
  expect(niceCeil(9500)).toBe(9500);
  expect(niceCeil(0)).toBe(0);
});

it('toDisplayPrices: своя валюта как есть, чужая конвертируется по курсу', () => {
  const pairs = [
    { price: 100, currency: 'USD' as const },
    { price: 1200000, currency: 'UZS' as const },
  ];
  expect(toDisplayPrices(pairs, 'USD', 12000)).toEqual([100, 100]);
});

it('toDisplayPrices: без курса чужая валюта пропускается', () => {
  const pairs = [
    { price: 100, currency: 'USD' as const },
    { price: 1200000, currency: 'UZS' as const },
  ];
  expect(toDisplayPrices(pairs, 'USD', undefined)).toEqual([100]);
});

it('buildPriceHistogram: раскладывает цены по бакетам, max попадает в последний', () => {
  const buckets = buildPriceHistogram([10, 10, 95, 100], { min: 0, max: 100 }, 10);
  expect(buckets).toHaveLength(10);
  expect(buckets[1].count).toBe(2); // 10..20
  expect(buckets[9].count).toBe(2); // 90..100 (95 и ровно 100)
  expect(buckets[0]).toEqual({ from: 0, to: 10, count: 0 });
});

it('buildPriceHistogram: пустые цены или вырожденный домен → []', () => {
  expect(buildPriceHistogram([], { min: 0, max: 100 })).toEqual([]);
  expect(buildPriceHistogram([5], { min: 0, max: 0 })).toEqual([]);
});
