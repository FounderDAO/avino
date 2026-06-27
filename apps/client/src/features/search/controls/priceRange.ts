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
