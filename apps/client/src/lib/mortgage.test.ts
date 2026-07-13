/**
 * Тесты чистой математики ипотечного калькулятора (чек-лист §8 спеки).
 * Проверяют паритет округлений с мобильным приложением и приоритет рекомендаций.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateMortgage,
  suggestFix,
  maxAffordablePrice,
  niceFloorPrice,
  defaultRateFor,
  DTI_LIMIT_PCT,
} from './mortgage';

describe('defaultRateFor', () => {
  it('USD → 8%, UZS → 22%', () => {
    expect(defaultRateFor('USD')).toBe(8);
    expect(defaultRateFor('UZS')).toBe(22);
  });
});

describe('calculateMortgage — §3.1', () => {
  it('референс-кейс сходится с мобилкой (100000 USD, 20%, 8%, 20 лет)', () => {
    const r = calculateMortgage({
      price: 100000,
      salary: 1400,
      downPct: 20,
      annualRatePct: 8,
      years: 20,
    });
    expect(r.downPayment).toBe(20000);
    expect(r.principal).toBe(80000);
    expect(r.monthly).toBe(669); // round(669.15…)
    expect(r.totalPaid).toBe(160560); // 669 * 240
    expect(r.totalInterest).toBe(80560);
    expect(r.dtiPct).toBe(48); // round(669 / 1400 * 100)
    expect(r.affordable).toBe(false);
  });

  it('DTI ровно 40% → affordable=true (нестрогое сравнение)', () => {
    // rate 0 %, взнос 0 %, principal 48000 / 120 мес = 400; 400 / 1000 = 40 %.
    const r = calculateMortgage({
      price: 48000,
      salary: 1000,
      downPct: 0,
      annualRatePct: 0,
      years: 10,
    });
    expect(r.monthly).toBe(400);
    expect(r.dtiPct).toBe(DTI_LIMIT_PCT);
    expect(r.affordable).toBe(true);
  });

  it('salary <= 0 → dtiPct=100, affordable=false', () => {
    const r = calculateMortgage({
      price: 100000,
      salary: 0,
      downPct: 20,
      annualRatePct: 8,
      years: 20,
    });
    expect(r.dtiPct).toBe(100);
    expect(r.affordable).toBe(false);
  });

  it('ставка 0% не роняет расчёт — линейное деление', () => {
    const r = calculateMortgage({
      price: 120000,
      salary: 5000,
      downPct: 0,
      annualRatePct: 0,
      years: 10,
    });
    expect(Number.isFinite(r.monthly)).toBe(true);
    expect(r.monthly).toBe(1000); // 120000 / 120
    expect(r.totalPaid).toBe(120000);
    expect(r.totalInterest).toBe(0);
  });

  it('totalPaid считается от ОКРУГЛЁННОГО monthly, а не round(monthlyRaw * n)', () => {
    const r = calculateMortgage({
      price: 100000,
      salary: 1400,
      downPct: 20,
      annualRatePct: 8,
      years: 20,
    });
    // Сырой платёж дробный (≈669.15); правильно: round(669.15…) * 240 = 160560.
    // Ловушка: round(669.15… * 240) ≈ 160596 — так считать НЕЛЬЗЯ.
    expect(r.totalPaid).toBe(r.monthly * 240);
    expect(r.totalPaid).toBe(160560);
    expect(r.totalPaid).not.toBe(160596);
  });
});

describe('suggestFix — приоритет §3.2', () => {
  it('референс-кейс (salary=1400) → рекомендация реально проходит DTI ≤ 40', () => {
    const fix = suggestFix({
      price: 100000,
      salary: 1400,
      downPct: 20,
      annualRatePct: 8,
      years: 20,
    });
    // Срок один не спасает (30 лет дают DTI 42) → рекомендация по взносу на сроке 30.
    expect(fix.type).toBe('downPayment');
    if (fix.type === 'downPayment' || fix.type === 'term') {
      expect(fix.dtiPct).toBeLessThanOrEqual(DTI_LIMIT_PCT);
    }
  });

  it('приоритет 1: спасает срок → type=term', () => {
    const fix = suggestFix({
      price: 100000,
      salary: 1500,
      downPct: 20,
      annualRatePct: 8,
      years: 20,
    });
    expect(fix.type).toBe('term');
    if (fix.type === 'term') {
      expect(fix.years).toBeGreaterThan(20);
      expect(fix.years).toBeLessThanOrEqual(30);
      expect(fix.dtiPct).toBeLessThanOrEqual(DTI_LIMIT_PCT);
      // Рекомендованный срок действительно проходит.
      const check = calculateMortgage({
        price: 100000,
        salary: 1500,
        downPct: 20,
        annualRatePct: 8,
        years: fix.years,
      });
      expect(check.dtiPct).toBeLessThanOrEqual(DTI_LIMIT_PCT);
    }
  });

  it('приоритет 2: срок не спасает, спасает взнос → type=downPayment на сроке 30', () => {
    const fix = suggestFix({
      price: 100000,
      salary: 1400,
      downPct: 20,
      annualRatePct: 8,
      years: 20,
    });
    expect(fix.type).toBe('downPayment');
    if (fix.type === 'downPayment') {
      expect(fix.years).toBe(30); // кнопка ставит и взнос, и 30 лет
      expect(fix.downPct).toBeGreaterThan(20);
      expect(fix.dtiPct).toBeLessThanOrEqual(DTI_LIMIT_PCT);
    }
  });

  it('приоритет 3: ничего не спасает → type=budget с maxPrice; перебор взноса не выше 60', () => {
    const fix = suggestFix({
      price: 100000,
      salary: 300,
      downPct: 20,
      annualRatePct: 8,
      years: 20,
    });
    // Даже взнос 60% на 30 годах не проходит → падаем в бюджет (loop капнут на 60).
    expect(fix.type).toBe('budget');
    if (fix.type === 'budget') {
      expect(fix.maxPrice).toBeGreaterThan(0);
    }
  });
});

describe('maxAffordablePrice — §3.3', () => {
  it('обратная проверка: расчёт при этой цене на 30 годах даёт DTI ≈ 40', () => {
    const price = maxAffordablePrice(1400, 20, 8);
    const r = calculateMortgage({ price, salary: 1400, downPct: 20, annualRatePct: 8, years: 30 });
    expect(Math.abs(r.dtiPct - DTI_LIMIT_PCT)).toBeLessThanOrEqual(1);
  });

  it('r === 0 → линейный budget * n', () => {
    // budget = 40% * 1000 = 400; n = 360; principal = 144000; downPct 0 → maxPrice 144000.
    expect(maxAffordablePrice(1000, 0, 0)).toBe(144000);
  });
});

describe('niceFloorPrice — округление ВНИЗ', () => {
  it('USD до тысяч', () => {
    expect(niceFloorPrice(123456, 'USD')).toBe(123000);
  });

  it('UZS до миллионов', () => {
    expect(niceFloorPrice(1234567890, 'UZS')).toBe(1234000000);
  });

  it('всегда вниз, не к ближайшему', () => {
    expect(niceFloorPrice(999, 'USD')).toBe(0);
    expect(niceFloorPrice(1999999, 'UZS')).toBe(1000000);
  });
});
