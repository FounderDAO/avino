/**
 * Разбиение карты сайта на файлы и XML индекса (/sitemap.xml).
 *
 * Next 15 по generateSitemaps() отдаёт /sitemap/<id>.xml, но индекс сам не
 * строит — его собирает route /sitemap.xml из тех же id.
 */
import { routing } from '@/i18n/routing';

/** Объявлений в странице API /search (максимум, который допускает API). */
export const SEARCH_API_PAGE = 100;

/**
 * Страниц API на один файл объявлений: каждое объявление даёт запись на каждую
 * локаль, держим файл ≤ 10 000 URL (лимит протокола — 50 000).
 */
export const PAGES_PER_LISTING_FILE = Math.floor(10_000 / (routing.locales.length * SEARCH_API_PAGE));

/** Предохранитель от бесконечного обхода: 500 страниц = 50 000 объявлений. */
export const MAX_LISTING_API_PAGES = 500;

export const LISTINGS_PREFIX = 'listings-';

/** Сколько файлов объявлений нужно под `total` объявлений (минимум один). */
export function listingFileCount(total: number): number {
  const pages = Math.min(MAX_LISTING_API_PAGES, Math.ceil(Math.max(0, total) / SEARCH_API_PAGE));
  return Math.max(1, Math.ceil(pages / PAGES_PER_LISTING_FILE));
}

/** id файлов карты: static, landings, agents, listings-0 … listings-(n-1). */
export function sitemapIds(totalListings: number): string[] {
  const listingIds = Array.from({ length: listingFileCount(totalListings) }, (_, i) => `${LISTINGS_PREFIX}${i}`);
  // landings — непустые гео-лендинги (район/регион × сделка, ≥ 3 объявлений).
  return ['static', 'landings', 'agents', ...listingIds];
}

/** `listings-3` → 3; всё остальное → null. */
export function parseListingFileId(id: string): number | null {
  if (!id.startsWith(LISTINGS_PREFIX)) return null;
  const rest = id.slice(LISTINGS_PREFIX.length);
  return /^(0|[1-9]\d*)$/.test(rest) ? Number(rest) : null;
}

/** Диапазон страниц API [from, to) для файла объявлений номер `n`. */
export function listingFilePages(n: number): { from: number; to: number } {
  const from = n * PAGES_PER_LISTING_FILE;
  return { from, to: Math.min(from + PAGES_PER_LISTING_FILE, MAX_LISTING_API_PAGES) };
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** XML индекса. lastmod не пишем: точной даты изменения файла у нас нет. */
export function sitemapIndexXml(base: string, ids: string[]): string {
  const items = ids.map((id) => `  <sitemap>\n    <loc>${escapeXml(`${base}/sitemap/${id}.xml`)}</loc>\n  </sitemap>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...items,
    '</sitemapindex>',
    '',
  ].join('\n');
}
