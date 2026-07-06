import { convertPrice } from '@/lib/format';
import type { Currency } from '@/lib/mock/types';

export interface PriceDomain {
  min: number;
  max: number;
}
export interface PriceDraft {
  /** null = без нижней границы (= домен.min). */
  min: number | null;
  /** null = без верхней границы (overflow «max+»). */
  max: number | null;
}

/** Ограничивает значение отрезком [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Шаг слайдера ≈ 1/100 ширины домена, минимум 1. */
export function niceStep(domain: PriceDomain): number {
  return Math.max(1, Math.round((domain.max - domain.min) / 100));
}

/** Применённый диапазон: null → undefined (без границы). */
export function toAppliedRange(draft: PriceDraft): { priceMin?: number; priceMax?: number } {
  return {
    priceMin: draft.min ?? undefined,
    priceMax: draft.max ?? undefined,
  };
}

/** Бакет клиентской гистограммы цены (бывший DTO price-distribution). */
export interface PriceBucket {
  from: number;
  to: number;
  count: number;
}

/** Сырая пара «цена + валюта» объявления из текущей выдачи. */
export interface PricePair {
  price: number;
  currency: Currency;
}

/** Округление вверх до 2 значащих цифр для «красивого» потолка домена (132000 → 140000). */
export function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const step = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.ceil(v / step) * step;
}

/**
 * Цены выдачи в display-валюте. Чужая валюта конвертируется по курсу ЦБУ;
 * без курса — пропускается (деградация как у бывшей серверной гистограммы).
 */
export function toDisplayPrices(pairs: PricePair[], display: Currency, rate?: number): number[] {
  const out: number[] = [];
  for (const p of pairs) {
    if (p.currency === display) out.push(p.price);
    else if (rate) out.push(convertPrice(p.price, p.currency, display, rate));
  }
  return out;
}

/** Гистограмма: n равных бакетов по домену; значение ровно max — в последний бакет. */
export function buildPriceHistogram(prices: number[], domain: PriceDomain, n = 30): PriceBucket[] {
  if (prices.length === 0 || domain.max <= domain.min) return [];
  const step = (domain.max - domain.min) / n;
  const counts = new Array<number>(n).fill(0);
  for (const p of prices) {
    if (p < domain.min || p > domain.max) continue;
    counts[Math.min(n - 1, Math.floor((p - domain.min) / step))] += 1;
  }
  return counts.map((count, i) => ({
    from: domain.min + i * step,
    to: domain.min + (i + 1) * step,
    count,
  }));
}
