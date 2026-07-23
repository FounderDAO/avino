/**
 * Тесты конверсии валют: convertPrice + formatPrice с display/rate.
 * Числа форматируются Intl.NumberFormat('en-US'): запятая — разделитель тысяч,
 * точка — дробная часть. Проверяем округление и префикс «≈».
 */
import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import { formatPrice, convertPrice, type T } from './format';
import ru from '../../messages/ru.json';

const t = createTranslator({ locale: 'ru', messages: ru as Record<string, unknown>, namespace: 'units' }) as unknown as T;
const RATE = 12650;

// ---------------------------------------------------------------------------
// convertPrice
// ---------------------------------------------------------------------------
describe('convertPrice', () => {
  it('USD→UZS multiplies', () => expect(convertPrice(100, 'USD', 'UZS', RATE)).toBe(1_265_000));
  it('UZS→USD divides', () => expect(convertPrice(1_265_000, 'UZS', 'USD', RATE)).toBe(100));
  it('same currency is identity', () => expect(convertPrice(50, 'USD', 'USD', RATE)).toBe(50));
});

// ---------------------------------------------------------------------------
// formatPrice with display currency
// ---------------------------------------------------------------------------
describe('formatPrice with display currency', () => {
  const usd = { price: '98000', currency: 'USD' as const, tx: 'SALE' as const };
  const uzs = { price: '1450000', currency: 'UZS' as const, tx: 'SALE' as const };

  it('native currency shows exact (no ≈)', () => {
    expect(formatPrice(uzs, t, { display: 'UZS', rate: RATE })).not.toContain('≈');
    expect(formatPrice(uzs, t, { display: 'UZS', rate: RATE })).toContain('сум');
  });

  it('UZS listing shown in USD is converted, rounded to whole $, with ≈', () => {
    // 1 450 000 / 12650 = 114.6 → $115
    expect(formatPrice(uzs, t, { display: 'USD', rate: RATE })).toBe('≈ $115');
  });

  it('USD listing shown in UZS is converted, rounded to 10 000, with ≈', () => {
    // 98000 * 12650 = 1,239,700,000 (уже кратно 10 000)
    const actual = formatPrice(usd, t, { display: 'UZS', rate: RATE });
    expect(actual).toBe('≈ 1,239,700,000 сум');
  });

  it('rounds converted UZS down to nearest 10 000', () => {
    // $120 000 * 11971.2 = 1,436,544,000 → 1,436,540,000
    const listing = { price: '120000', currency: 'USD' as const, tx: 'SALE' as const };
    const actual = formatPrice(listing, t, { display: 'UZS', rate: 11_971.2 });
    expect(actual).toBe('≈ 1,436,540,000 сум');
  });

  it('falls back to native when rate is missing', () => {
    expect(formatPrice(uzs, t, { display: 'USD' })).not.toContain('≈');
  });
});
