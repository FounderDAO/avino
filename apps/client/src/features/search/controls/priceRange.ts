export interface PriceDomain {
  min: number;
  max: number;
}
export interface PriceDraft {
  min: number;
  max: number;
}

/** Ограничивает значение отрезком [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Шаг слайдера ≈ 1/100 ширины домена, минимум 1. */
export function niceStep(domain: PriceDomain): number {
  return Math.max(1, Math.round((domain.max - domain.min) / 100));
}

/**
 * Применённый диапазон: значение на краю домена трактуется как «без границы»
 * (min на дне → нет нижней границы; max на потолке → overflow «max+»).
 */
export function toAppliedRange(
  draft: PriceDraft,
  domain: PriceDomain,
): { priceMin?: number; priceMax?: number } {
  return {
    priceMin: draft.min > domain.min ? draft.min : undefined,
    priceMax: draft.max < domain.max ? draft.max : undefined,
  };
}
