/**
 * Форматирование значений для таблиц админ-панели.
 *
 * Цена/площадь приходят Decimal-строкой (ADR-002, никогда float) — форматируем
 * как строку, не приводя к `number`, чтобы не терять точность. Даты — ISO-8601
 * UTC; показываем в локали ru-RU. Хелперы общие для ADMIN-08..15.
 */

import type { Currency } from '@/store/api/adminTypes';

const PRICE_GROUPING = /\B(?=(\d{3})+(?!\d))/g;

/** `"125000"` + `USD` → `"125 000 USD"`. Группирует только целую часть. */
export function formatPrice(price: string, currency: Currency): string {
  const [intPart, fracPart] = price.split('.');
  const grouped = intPart.replace(PRICE_GROUPING, ' ');
  const body = fracPart ? `${grouped},${fracPart}` : grouped;
  return `${body} ${currency}`;
}

/** ISO-строка → `"02.06.2026, 13:10"` (ru-RU). Пустые/битые даты → `"—"`. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
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
