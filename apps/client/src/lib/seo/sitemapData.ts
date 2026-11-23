/**
 * Данные для карты сайта: объявления и агенты из API с кэшем на час.
 *
 * Раньше sitemap ходил в API с `cache: 'no-store'` и при каждом запросе
 * проходил до 50 страниц поиска (прод: 4,3 с). Теперь каждая страница API
 * кэшируется в Data Cache (revalidate 3600): файлы объявлений проходят одни и
 * те же курсоры и переиспользуют ответы.
 */
import { resolveApiBase } from '@/lib/api/base';
import { mapListing, type SearchEnvelope } from '@/lib/api/listings';
import type { Listing, TransactionType } from '@/lib/mock/types';
import { MAX_LISTING_API_PAGES, SEARCH_API_PAGE } from './sitemapIndex';
import { isAgentIndexable } from './agentIndex';
import { CACHE_TAGS } from '@/lib/api/cacheTags';

export const SITEMAP_REVALIDATE = 3600;

const init: RequestInit = {
  next: { revalidate: SITEMAP_REVALIDATE, tags: [CACHE_TAGS.sitemap] },
  headers: { Accept: 'application/json', 'Accept-Language': 'ru' },
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${resolveApiBase()}${path}`, init);
  if (!res.ok) throw new Error(`[sitemap] API ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** Общее число активных объявлений (для числа файлов). Ошибка → 0. */
export async function fetchListingTotal(): Promise<number> {
  try {
    const env = await getJson<SearchEnvelope>('/search?limit=1');
    return env.meta.total;
  } catch (err) {
    console.error('[sitemap] listing total failed:', err);
    return 0;
  }
}

export interface ListingSitemapRow {
  id: string;
  /** Дата изменения содержимого (backend SEO AUD-6); без неё lastmod не ставим. */
  updatedAt?: string;
}

/**
 * Объявления со страниц API [from, to): проход курсоров с начала (ответы
 * кэшированы). Активные только: /search без include_closed. lastmod — только из
 * updated_at (дата содержимого); createdAt или «сейчас» были бы ложной датой.
 */
export async function fetchListingIds(from: number, to: number): Promise<ListingSitemapRow[]> {
  const ids: ListingSitemapRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < Math.min(to, MAX_LISTING_API_PAGES); page++) {
    const qs = new URLSearchParams({ limit: String(SEARCH_API_PAGE) });
    if (cursor) qs.set('cursor', cursor);
    const env: SearchEnvelope = await getJson<SearchEnvelope>(`/search?${qs.toString()}`);
    if (page >= from) ids.push(...env.data.map((item) => ({ id: item.id, updatedAt: item.updated_at ?? undefined })));
    cursor = env.meta.next_cursor;
    if (!cursor) break;
  }
  return ids;
}

interface ApiAgentRow {
  id: string;
  about?: string | null;
  active_listings_count?: number | null;
}

/** Публичные агенты, чьи профили индексируются (isAgentIndexable: «О себе» или ≥ 3 объявлений). */
export async function fetchAgentIds(): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 50; page++) {
    const env = await getJson<{ data: ApiAgentRow[]; meta: { total: number; limit: number } }>(
      `/agents?limit=100&page=${page}`,
    );
    for (const a of env.data) {
      if (isAgentIndexable({ about: a.about, activeListingsCount: a.active_listings_count })) ids.push(a.id);
    }
    if (page * env.meta.limit >= env.meta.total || env.data.length === 0) break;
  }
  return ids;
}

export interface DistrictCount {
  tx: TransactionType;
  districtId: string;
  count: number;
}

/** Ответ GET /search/facets (backend SEO AUD-12) — нужные сайту поля. */
interface ApiFacets {
  by_district: { id: string; count: number }[];
  by_region: { id: string; count: number }[];
}

const TX_VALUES: TransactionType[] = ['SALE', 'RENT'];

/**
 * Счётчики по сделке из /search/facets. null — старый API без этого
 * эндпоинта (тогда считаем проходом выдачи).
 */
async function fetchFacetsByTx(): Promise<Map<TransactionType, ApiFacets> | null> {
  const out = new Map<TransactionType, ApiFacets>();
  for (const tx of TX_VALUES) {
    const res = await fetch(`${resolveApiBase()}/search/facets?transaction_type=${tx}`, init);
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`[sitemap] API ${res.status} for /search/facets`);
    out.set(tx, (await res.json()) as ApiFacets);
  }
  return out;
}

/** Порог «непустого» лендинга района/региона: меньше — тонкая страница, не в sitemap. */
export const LANDING_MIN_LISTINGS = 3;

/**
 * Пути непустых гео-лендингов (FE-10): район или регион × сделка с ≥ 3
 * активными объявлениями, в канонической форме /search?tx=…&district_id=….
 * Без /search/facets (старый API) — пусто: проход выдачи ради этого не делаем.
 */
export async function fetchLandingPaths(): Promise<string[]> {
  const facets = await fetchFacetsByTx();
  if (!facets) return [];
  const paths: string[] = [];
  for (const [tx, f] of facets) {
    for (const r of f.by_region) if (r.count >= LANDING_MIN_LISTINGS) paths.push(`/search?tx=${tx}&region_id=${r.id}`);
    for (const d of f.by_district) if (d.count >= LANDING_MIN_LISTINGS) paths.push(`/search?tx=${tx}&district_id=${d.id}`);
  }
  return paths;
}

/**
 * Число активных объявлений по (сделка, район) — для «топ районов» в llms.txt.
 * Из /search/facets (backend SEO AUD-12); старый API — проход курсоров, как у
 * sitemap (ответы из Data Cache).
 */
export async function fetchDistrictCounts(): Promise<DistrictCount[]> {
  const facets = await fetchFacetsByTx();
  if (facets) {
    return [...facets]
      .flatMap(([tx, f]) => f.by_district.map((d) => ({ tx, districtId: d.id, count: d.count })))
      .sort((a, b) => b.count - a.count);
  }
  const counts = new Map<string, DistrictCount>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_LISTING_API_PAGES; page++) {
    const qs = new URLSearchParams({ limit: String(SEARCH_API_PAGE) });
    if (cursor) qs.set('cursor', cursor);
    const env: SearchEnvelope = await getJson<SearchEnvelope>(`/search?${qs.toString()}`);
    for (const item of env.data) {
      if (!item.district_id) continue;
      const tx = item.transaction_type as TransactionType;
      const key = `${tx}:${item.district_id}`;
      const entry = counts.get(key) ?? { tx, districtId: item.district_id, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    cursor = env.meta.next_cursor;
    if (!cursor) break;
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/** Самые свежие активные объявления (для llms-full.txt), на языке `lang`. */
export async function fetchRecentListings(limit: number, lang: string): Promise<Listing[]> {
  const out: Listing[] = [];
  let cursor: string | null = null;
  while (out.length < limit) {
    const qs = new URLSearchParams({ limit: String(Math.min(SEARCH_API_PAGE, limit - out.length)), sort: 'date_desc' });
    if (cursor) qs.set('cursor', cursor);
    const res = await fetch(`${resolveApiBase()}/search?${qs.toString()}`, {
      next: { revalidate: SITEMAP_REVALIDATE, tags: [CACHE_TAGS.sitemap] },
      headers: { Accept: 'application/json', 'Accept-Language': lang },
    });
    if (!res.ok) throw new Error(`[llms] API ${res.status} for recent listings`);
    const env = (await res.json()) as SearchEnvelope;
    out.push(...env.data.map(mapListing));
    cursor = env.meta.next_cursor;
    if (!cursor) break;
  }
  return out;
}
