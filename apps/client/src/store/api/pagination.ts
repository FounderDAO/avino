/**
 * Общие типы и хелперы пагинации публичного портала (docs/API.md §4).
 *
 * Единый envelope коллекций API:
 *   { "data": [ ... ], "meta": { "limit", "total"?, "next_cursor"? } }
 *
 * Публичный поиск/листинги используют **keyset/cursor**-режим
 * (`cursor` → `meta.next_cursor`, `null` на конце). Поля оставлены
 * совместимыми с page-based режимом, чтобы один `Paginated<T>` обслуживал
 * оба варианта без дублирования типов (ср. apps/web `pagination.ts`).
 *
 * snake_case сохраняется как в API (CLAUDE.md §4, бэкенд отдаёт snake_case).
 */

/** Метаданные страницы. Конкретный режим определяет, какие поля заполнены. */
export interface PageMeta {
  /** Размер страницы (default 20, max 100). Присутствует всегда. */
  limit: number;
  /** Общее число записей (page-based; в keyset может присутствовать как счётчик). */
  total?: number;
  /** Непрозрачный токен следующей страницы (keyset) либо `null` на конце. */
  next_cursor?: string | null;
}

/** Унифицированный ответ-коллекция API. */
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Зажать `limit` в допустимый диапазон API [1, 100]. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
}

/**
 * Привести объект фильтров к query-параметрам для RTK Query
 * (`fetchBaseQuery` сериализует объект `params` сам). Отбрасывает `undefined`,
 * `null` и пустые строки, чтобы не слать «пустые» фильтры на бэкенд
 * (forward-compatible: неизвестные/пустые параметры игнорируются, §4).
 */
export function toQueryParams(
  params: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
}
