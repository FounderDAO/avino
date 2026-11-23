/**
 * Номерная пагинация для краулеров: разбор `?page=`, окно номеров и ссылки.
 */
import { MAX_NUMBERED_PAGES } from '@/lib/api/cursorPaging';

type SP = Record<string, string | string[] | undefined>;

/**
 * `?page=` → номер страницы. Нет параметра — 1; не целое > 0 — null (→ 404).
 */
export function parsePageParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return 1;
  if (!/^[1-9]\d{0,3}$/.test(value)) return null;
  return Number(value);
}

/** Число номерных страниц: не меньше 1 и не больше MAX_NUMBERED_PAGES. */
export function totalPages(total: number, pageSize: number): number {
  return Math.min(MAX_NUMBERED_PAGES, Math.max(1, Math.ceil(total / pageSize)));
}

/** Компактное окно номеров: 1 … 4 5 [6] 7 8 … 20 (null — многоточие). */
export function pageWindow(current: number, total: number, radius = 2): (number | null)[] {
  const pages = new Set<number>([1, total]);
  for (let p = current - radius; p <= current + radius; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === 'number' && p - prev > 1) out.push(p - prev === 2 ? p - 1 : null);
    out.push(p);
  }
  return out;
}

/**
 * Ссылка на страницу `page` с текущими параметрами (без cursor/page;
 * page=1 не пишется — у первой страницы один адрес).
 */
export function pageHref(pathname: string, sp: SP, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === 'page' || key === 'cursor' || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
