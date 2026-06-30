import { it, expect } from 'vitest';
import { compactPrice } from './format';

// units-переводчик: ключ → сам ключ
const t = (k: string) => k;

it('USD: тысячи и миллионы', () => {
  expect(compactPrice(0, 'USD', t)).toBe('$0');
  expect(compactPrice(98000, 'USD', t)).toBe('$98k');
  expect(compactPrice(1500000, 'USD', t)).toBe('$1.5M');
});

it('UZS: тысячи/миллионы/миллиарды с unit-ключами', () => {
  expect(compactPrice(500, 'UZS', t)).toBe('500 sum');
  expect(compactPrice(98000, 'UZS', t)).toBe('98k');
  expect(compactPrice(1500000000, 'UZS', t)).toBe('1.5 billion');
});
