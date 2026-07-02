/**
 * Адаптеры: API DTO тарифов промо (`AdminPromotionPlan[]`) → UI-модель страницы.
 * Цикл 3: вёрстка остаётся на той же сигнатуре цены (`PromoPricing`), источник
 * данных — RTK Query (`GET /admin/promotion-plans`).
 *
 * `price` приходит decimal-строкой (ADR-002) — для UI приводим к `number`.
 * Редактирование цены/активности идёт через `PATCH /admin/promotion-plans/:id`,
 * поэтому помимо плоской таблицы цен возвращаем индекс с самими планами (нужен
 * `plan.id` по паре `(type, days)`).
 */
import type {
  AdminPromotionPlan,
  AdminPromotionRow,
  PromotionStatus,
  PromotionType,
} from '@/store/api/adminTypes';
import type { PromoPricing } from '@/lib/mock';

/** Тип-тариф (платные тиры; `NORMAL` — не тариф). */
export type PromoPlanType = 'TOP' | 'VIP';
/** Допустимые сроки промо (дни). */
export const PROMO_DAYS = [7, 14, 30] as const;

/**
 * Индекс планов по `type → days → plan`. Нужен для PATCH цены/активности
 * конкретного тарифа: ячейка таблицы знает `(type, days)`, отсюда достаёт `id`.
 */
export type PromoPlanIndex = Record<PromoPlanType, Record<number, AdminPromotionPlan>>;

/**
 * Плоская таблица цен для вёрстки (`PromoPricing`): группировка планов по
 * `type → { days: priceNumber }`. Срок без плана отсутствует в карте (UI рисует
 * пустое поле).
 */
export function plansToPricing(plans: AdminPromotionPlan[]): PromoPricing {
  const out: PromoPricing = { TOP: {}, VIP: {} };
  for (const p of plans) {
    out[p.type][p.period_days] = Number(p.price);
  }
  return out;
}

/** Индекс планов по `(type, days)` — для адресации PATCH по `plan.id`. */
export function plansToIndex(plans: AdminPromotionPlan[]): PromoPlanIndex {
  const out: PromoPlanIndex = { TOP: {}, VIP: {} };
  for (const p of plans) {
    out[p.type][p.period_days] = p;
  }
  return out;
}

/** Достаёт план по паре `(type, days)` из индекса, либо `undefined`. */
export function findPlan(
  index: PromoPlanIndex,
  type: PromoPlanType,
  days: number,
): AdminPromotionPlan | undefined {
  return index[type][days];
}

// ─── Глобальная история промо (`GET /admin/promotions`, ADMIN-16) ────────────

const DASH = '—';

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** ISO → «дд.мм.гггг» (или «—» при null/невалидной дате). */
function fmtDate(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d);
}

/** UUID → короткая форма (первые 8 символов), как в adapters/logs. */
function shortId(id: string | null): string {
  if (!id) return DASH;
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Статус промо: `[RU-метка, цвет текста, фон]` для пилла (токены globals.css). */
export const PROMOTION_STATUS_MAP: Record<
  PromotionStatus,
  [label: string, color: string, bg: string]
> = {
  PENDING_PAYMENT: ['Ждёт оплаты', 'var(--warn)', 'var(--warn-bg)'],
  ACTIVE: ['Активно', 'var(--green)', 'var(--green-bg)'],
  EXPIRED: ['Истекло', 'var(--muted)', 'var(--archive-bg)'],
  CANCELLED: ['Отменено', 'var(--red)', 'var(--red-bg)'],
  REFUNDED: ['Возврат', 'var(--teal)', 'var(--mint)'],
};

/** Строка таблицы «История продвижений» (под реальную вёрстку). */
export interface PromoHistoryRow {
  id: string;
  /** Полный UUID листинга — для ссылки на /admin/listings/{id}. */
  listingId: string;
  /** Title на языке оригинала; пустой title → короткий UUID листинга. */
  listing: string;
  buyer: string;
  type: PromotionType;
  days: number;
  bought: string;
  expires: string;
  status: PromotionStatus;
  /** «12,345 сум» / «12,345 $» или «—», если цена не проставлена. */
  amount: string;
}

export function promotionToHistoryRow(p: AdminPromotionRow): PromoHistoryRow {
  const amount = p.price
    ? `${Number(p.price).toLocaleString('en-US')} ${p.currency === 'USD' ? '$' : 'сум'}`
    : DASH;
  return {
    id: p.id,
    listingId: p.listing_id,
    listing: p.listing_title || shortId(p.listing_id),
    buyer: shortId(p.user_id),
    type: p.type,
    days: p.period_days,
    bought: fmtDate(p.starts_at ?? p.created_at),
    expires: fmtDate(p.expires_at),
    status: p.status,
    amount,
  };
}
