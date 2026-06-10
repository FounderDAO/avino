/**
 * Общие типы и хелперы пагинации (ADMIN-07, docs/API.md §4).
 *
 * Единый envelope коллекций:
 *   { "data": [ ... ], "meta": { "limit", "total"?, "page"?, "next_cursor"? } }
 *
 * Два режима (§4):
 * - **page-based** (1-based `page` + `limit`, `meta.total` обязателен) —
 *   справочные и админ-списки (§6, §16). Это основной режим админ-панели.
 * - **keyset/cursor** (`cursor` → `meta.next_cursor`) — публичный поиск/листинги.
 *   Поля cursor оставлены опциональными, чтобы один `Paginated<T>` обслуживал
 *   оба режима без дублирования типов.
 *
 * snake_case сохраняется как в API (CLAUDE.md §4, бэкенд отдаёт snake_case).
 */

/** Метаданные страницы. Конкретный режим определяет, какие поля заполнены. */
export interface PageMeta {
  /** Размер страницы (default 20, max 100). Присутствует всегда. */
  limit: number;
  /** Общее число записей. Обязателен в page-based режиме (§4). */
  total?: number;
  /** Текущая страница (1-based). Присутствует в page-based режиме. */
  page?: number;
  /** Непрозрачный токен следующей страницы (keyset) либо `null` на конце. */
  next_cursor?: string | null;
}

/** Унифицированный ответ-коллекция API. */
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Параметры page-based списка (админ-панель). */
export interface PageParams {
  page?: number;
  limit?: number;
}

/** Параметры keyset-списка (публичный поиск). */
export interface CursorParams {
  cursor?: string;
  limit?: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Зажать `limit` в допустимый диапазон API [1, 100]. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT);
}

/**
 * Привести объект фильтров/параметров к query-параметрам для RTK Query
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

/** Число страниц из `meta` (page-based). 0, если `total` неизвестен. */
export function totalPages(meta: PageMeta | undefined): number {
  if (!meta?.total || !meta.limit) return 0;
  return Math.ceil(meta.total / meta.limit);
}
