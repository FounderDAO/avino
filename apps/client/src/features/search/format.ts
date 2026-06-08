import { Currency, DealType, PromotionType, PropertyType } from '@avino/shared';
import type { SearchSort } from '@/store/api/searchApi';

/**
 * Человекочитаемые подписи и форматтеры для выдачи поиска (RU UI).
 * Значения берутся из enum'ов `@avino/shared` — единый источник правды
 * (CLAUDE.md §9, без хардкода кодов в компонентах).
 */

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  [PropertyType.APARTMENT]: 'Квартира',
  [PropertyType.HOUSE]: 'Дом',
  [PropertyType.COMMERCIAL]: 'Коммерция',
  [PropertyType.LAND]: 'Участок',
};

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  [DealType.SALE]: 'Продажа',
  [DealType.RENT]: 'Аренда',
};

export const PROMOTION_LABELS: Partial<Record<PromotionType, string>> = {
  [PromotionType.VIP]: 'VIP',
  [PromotionType.TOP]: 'TOP',
};

export const SORT_LABELS: Record<SearchSort, string> = {
  promotion_priority_desc: 'По умолчанию',
  date_desc: 'Сначала новые',
  price_asc: 'Дешевле',
  price_desc: 'Дороже',
  area_asc: 'Меньше площадь',
  area_desc: 'Больше площадь',
};

/** Сумма + валюта: `950 000 000 сум`, `120 000 $`. */
export function formatPrice(price: string, currency: Currency): string {
  const value = Number(price);
  const amount = Number.isNaN(value)
    ? price
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
  const suffix = currency === Currency.USD ? '$' : 'сум';
  return `${amount} ${suffix}`;
}

/** `3-комн.` либо `Студия`/`—` для пустого значения. */
export function formatRooms(rooms: number | null): string {
  if (rooms === null || rooms === undefined) return '—';
  if (rooms === 0) return 'Студия';
  return `${rooms}-комн.`;
}
