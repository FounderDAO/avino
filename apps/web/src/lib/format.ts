/**
 * Форматирование значений для таблиц админ-панели.
 *
 * Цена/площадь приходят Decimal-строкой (ADR-002, никогда float) — форматируем
 * как строку, не приводя к `number`, чтобы не терять точность. Даты — ISO-8601
 * UTC; показываем в локали интерфейса (ADMIN-17). Хелперы общие для ADMIN-08..15.
 */

import type { Currency } from '@/store/api/adminTypes';
import { LOCALE_META, type Locale } from '@/lib/i18n/config';

const PRICE_GROUPING = /\B(?=(\d{3})+(?!\d))/g;

/** `"125000"` + `USD` → `"125 000 USD"`. Группирует только целую часть. */
export function formatPrice(price: string, currency: Currency): string {
  const [intPart, fracPart] = price.split('.');
  const grouped = intPart.replace(PRICE_GROUPING, ' ');
  const body = fracPart ? `${grouped},${fracPart}` : grouped;
  return `${body} ${currency}`;
}

/** ISO-строка → дата-время в локали интерфейса. Пустые/битые даты → `"—"`. */
export function formatDateTime(
  iso: string | null | undefined,
  locale: Locale,
): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(LOCALE_META[locale].bcp47, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Короткий id для таблиц: `"a1b2c3d4-…"` → первые 8 символов. */
export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}
