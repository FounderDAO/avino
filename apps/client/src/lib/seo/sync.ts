/**
 * POST /api/seo/sync — контракт с backend (docs/seo/ORDER-BACKEND-SEO-GEO-2026-11-20.md, п. A).
 *
 * Backend сообщает id изменённых объявлений и агентов; frontend сам знает,
 * какие страницы и кэши от них зависят: сбрасывает теги Data Cache и
 * отправляет URL всех языковых версий в IndexNow.
 */
import { routing } from '@/i18n/routing';
import { CACHE_TAGS } from '@/lib/api/cacheTags';
import { isUuid } from '@/lib/api/ids';
import { localeUrl } from './alternates';

/** Не больше id за один вызов (оба списка вместе). */
export const MAX_SYNC_IDS = 500;

export interface SyncRequest {
  listingIds: string[];
  agentIds: string[];
}

const uniqueUuids = (v: unknown): string[] | null => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && isUuid(x))) return null;
  return [...new Set(v.map((x) => x.toLowerCase()))];
};

/** Тело запроса → id или текст ошибки (400). */
export function parseSyncBody(body: unknown): SyncRequest | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const listingIds = uniqueUuids(b.listing_ids);
  const agentIds = uniqueUuids(b.agent_ids);
  if (!listingIds || !agentIds) return { error: 'listing_ids and agent_ids must be arrays of UUIDs' };
  if (listingIds.length + agentIds.length === 0) return { error: 'nothing to sync' };
  if (listingIds.length + agentIds.length > MAX_SYNC_IDS) return { error: `at most ${MAX_SYNC_IDS} ids per call` };
  return { listingIds, agentIds };
}

/** Теги Data Cache, которые надо сбросить. */
export function syncTags({ listingIds, agentIds }: SyncRequest): string[] {
  const tags = new Set<string>();
  for (const id of listingIds) tags.add(CACHE_TAGS.listing(id));
  // Объявление меняет выдачи, профили агентов, sitemap и llms.txt.
  if (listingIds.length > 0) {
    tags.add(CACHE_TAGS.search);
    tags.add(CACHE_TAGS.sitemap);
    tags.add(CACHE_TAGS.agents);
  }
  for (const id of agentIds) tags.add(CACHE_TAGS.agent(id));
  if (agentIds.length > 0) tags.add(CACHE_TAGS.agents);
  return [...tags];
}

/** URL всех языковых версий для IndexNow. */
export function syncUrls({ listingIds, agentIds }: SyncRequest): string[] {
  const paths = [...listingIds.map((id) => `/listing/${id}`), ...agentIds.map((id) => `/agents/${id}`)];
  return paths.flatMap((path) => routing.locales.map((locale) => localeUrl(locale, path)));
}
