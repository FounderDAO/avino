import { Currency, Language, PromotionType } from '@avino/shared';
import { formatPrice } from '@/features/search/format';

/**
 * Форматтеры и подписи карточки объявления (TASK-153, RU UI).
 *
 * Базовые форматтеры цены/комнат/типа переиспользуются из features/search/format
 * (единый источник правды, CLAUDE.md §9) — здесь только специфика детальной
 * страницы: площадь, этаж, год, оценка ипотеки, языки, активность промо.
 */

export const LANGUAGE_LABELS: Record<Language, string> = {
  [Language.UZ]: "O'zbekcha",
  [Language.RU]: 'Русский',
  [Language.EN]: 'English',
};

export const PROMOTION_BADGE_LABELS: Partial<Record<PromotionType, string>> = {
  [PromotionType.VIP]: 'VIP',
  [PromotionType.TOP]: 'TOP',
};

/**
 * Активен ли промо-тир. `null` срок = бессрочно активно; иначе сравнение с
 * текущим временем (истёкшее промо бэкенд трактует как NORMAL — зеркалим в UI).
 */
export function isPromotionActive(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const ts = new Date(expiresAt).getTime();
  return Number.isNaN(ts) ? false : ts > Date.now();
}

/** Площадь `62.50` → `62.5 м²`; `null`/мусор → `null`. */
export function formatArea(area: string | null): string | null {
  if (area === null) return null;
  const value = Number(area);
  if (Number.isNaN(value)) return null;
  const amount = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
  }).format(value);
  return `${amount} м²`;
}

/** Этаж `8/10`, либо только `8`, либо `null` если этажа нет. */
export function formatFloor(
  floor: number | null,
  totalFloors: number | null,
): string | null {
  if (floor === null) return null;
  return totalFloors ? `${floor}/${totalFloors} этаж` : `${floor} этаж`;
}

/**
 * Грубая оценка ежемесячного платежа по ипотеке (placeholder до реального
 * калькулятора): 20 лет, аннуитет ~14% годовых. Возвращает форматированную
 * строку или `null`, если цену не распарсить.
 */
export function estimateMortgage(
  price: string,
  currency: Currency,
): string | null {
  const principal = Number(price);
  if (Number.isNaN(principal) || principal <= 0) return null;
  const monthlyRate = 0.14 / 12;
  const months = 240;
  const payment =
    (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  return formatPrice(String(Math.round(payment)), currency);
}
