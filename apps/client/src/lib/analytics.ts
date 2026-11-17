/**
 * События аналитики для Google Tag Manager (контейнер GTM-MJJH624V).
 *
 * Сайт только кладёт события в window.dataLayer. GA4, Meta Pixel и Clarity
 * подключены внутри контейнера, напрямую их сюда не добавлять — иначе
 * двойной счёт.
 *
 * Персональные данные (имя, телефон, email) в события не кладём никогда.
 */

export const GTM_ID = 'GTM-MJJH624V';

type DealType = 'SALE' | 'RENT' | string;

export type AnalyticsEvent =
  | {
      event: 'search';
      deal_type: DealType;
      city: string | null;
      district: string | null;
      price_min: number | null;
      price_max: number | null;
    }
  | {
      event: 'view_listing';
      listing_id: string;
      deal_type: DealType;
      price: number | null;
      city: string | null;
    }
  | { event: 'contact_click'; listing_id: string; method: 'phone' | 'message' }
  | { event: 'add_favorite'; listing_id: string }
  | { event: 'sign_up'; user_type: 'owner' | 'agent' | 'seeker' }
  | { event: 'listing_start' }
  | { event: 'listing_published'; listing_id: string; deal_type: DealType };

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export function track(e: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(e);
  } catch {
    // Аналитика не должна ломать сайт.
  }
}

/**
 * Регистрация. Тип пользователя на сайте при регистрации неизвестен (у всех
 * роль USER), поэтому берём его по месту входа: из подачи объявления — owner,
 * из заявки агента — agent, иначе seeker.
 */
export function trackSignUp(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname.replace(/^\/(ru|uz|en)(?=\/|$)/, '');
  const user_type = path.startsWith('/sell')
    ? 'owner'
    : path.startsWith('/become-agent')
      ? 'agent'
      : 'seeker';
  track({ event: 'sign_up', user_type });
}

/** Цена из Decimal-строки API ("1250000.00") в число; мусор → null. */
export function toPrice(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
