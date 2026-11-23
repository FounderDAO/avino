/**
 * Номерные страницы поверх keyset-курсора /search.
 *
 * API отдаёт только `next_cursor` (offset/page не принимает), а краулеру нужны
 * обычные ссылки `?page=N`. Поэтому страницу N находим, проходя курсоры
 * с начала, и запоминаем цепочку: следующий запрос той же выдачи идёт сразу
 * с ближайшего известного курсора.
 */

/** Жёсткий предел номерных страниц: дальше — только sitemap и «Показать ещё». */
export const MAX_NUMBERED_PAGES = 50;

export interface CursorPage {
  nextCursor: string | null;
}

/**
 * Кэш цепочек курсоров (в памяти процесса, TTL + ограничение размера).
 * `cursors[i]` — курсор начала страницы i+1; для первой страницы — undefined.
 */
export class CursorChainCache {
  private readonly map = new Map<string, { cursors: (string | undefined)[]; at: number }>();

  constructor(
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): (string | undefined)[] {
    const hit = this.map.get(key);
    if (!hit || this.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return [undefined];
    }
    return hit.cursors;
  }

  set(key: string, cursors: (string | undefined)[]): void {
    this.map.delete(key);
    this.map.set(key, { cursors, at: this.now() });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
}

/**
 * Возвращает страницу `page` (с 1) или null, если выдача кончилась раньше.
 * Ошибки `fetchPage` не глотаются: 5xx API не должен превращаться в 404.
 */
export async function fetchPageByNumber<P extends CursorPage>(
  key: string,
  page: number,
  fetchPage: (cursor: string | undefined) => Promise<P>,
  cache: CursorChainCache,
): Promise<P | null> {
  if (!Number.isInteger(page) || page < 1 || page > MAX_NUMBERED_PAGES) return null;
  const cursors = [...cache.get(key)];
  // Стартуем с самой дальней известной страницы, не дальше нужной.
  let index = Math.min(cursors.length, page) - 1;
  for (;;) {
    const result = await fetchPage(cursors[index]);
    if (index === page - 1) {
      cache.set(key, cursors);
      return result;
    }
    if (!result.nextCursor) {
      cache.set(key, cursors);
      return null;
    }
    index += 1;
    cursors[index] = result.nextCursor;
  }
}
