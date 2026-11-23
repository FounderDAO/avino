/**
 * sitemap.ts — карта сайта по файлам (generateSitemaps, Next 15):
 *   /sitemap/static.xml       — статические посадочные
 *   /sitemap/agents.xml       — /agents/[id] агентов с активными объявлениями
 *   /sitemap/listings-<n>.xml — объявления, ≤ 10 000 URL на файл
 * Индекс /sitemap.xml собирает route sitemap.xml/route.ts из тех же id.
 *
 * Каждая запись — на каждую локаль с одинаковым блоком hreflang. Кэш — час
 * (revalidate), без no-store. lastmod у объявлений — только из updated_at API
 * (дата содержимого, backend SEO AUD-6); у статических страниц его нет: «сейчас»
 * или createdAt — ложный сигнал.
 * При ошибке API файл объявлений/агентов отдаётся пустым, а не 500.
 */
import type { MetadataRoute } from 'next';
import { hreflangLanguages, localeUrl } from '@/lib/seo/alternates';
import { routing } from '@/i18n/routing';
import { listingFilePages, parseListingFileId, sitemapIds } from '@/lib/seo/sitemapIndex';
import { fetchAgentIds, fetchLandingPaths, fetchListingIds, fetchListingTotal } from '@/lib/seo/sitemapData';

export const revalidate = 3600;

const { locales } = routing;

/** Одна запись на КАЖДУЮ локаль (uz/ru/en), у всех — одинаковый блок hreflang. */
function localizedEntries(
  path: string,
  extra: Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>,
): MetadataRoute.Sitemap {
  const languages = hreflangLanguages(path);
  return locales.map((locale) => ({
    ...extra,
    url: localeUrl(locale, path),
    alternates: { languages },
  }));
}

/** Только канонические индексируемые адреса (200, без noindex). */
const STATIC_ROUTES: MetadataRoute.Sitemap = [
  ...localizedEntries('/', { changeFrequency: 'daily', priority: 1.0 }),
  ...localizedEntries('/search?tx=SALE', { changeFrequency: 'daily', priority: 0.9 }),
  ...localizedEntries('/search?tx=RENT', { changeFrequency: 'daily', priority: 0.9 }),
  ...localizedEntries('/map', { changeFrequency: 'daily', priority: 0.8 }),
  ...localizedEntries('/agents', { changeFrequency: 'weekly', priority: 0.6 }),
  ...localizedEntries('/sell', { changeFrequency: 'monthly', priority: 0.7 }),
  ...localizedEntries('/about', { changeFrequency: 'monthly', priority: 0.5 }),
  ...localizedEntries('/help', { changeFrequency: 'monthly', priority: 0.5 }),
];

export async function generateSitemaps() {
  return sitemapIds(await fetchListingTotal()).map((id) => ({ id }));
}

export default async function sitemap({ id }: { id: string }): Promise<MetadataRoute.Sitemap> {
  if (id === 'static') return STATIC_ROUTES;

  // Непустые гео-лендинги (FE-10): канонические /search?tx=…&district_id|region_id=….
  if (id === 'landings') {
    try {
      const paths = await fetchLandingPaths();
      return paths.flatMap((path) => localizedEntries(path, { changeFrequency: 'daily', priority: 0.7 }));
    } catch (err) {
      console.error('[sitemap] landings failed:', err);
      return [];
    }
  }

  if (id === 'agents') {
    try {
      const ids = await fetchAgentIds();
      return ids.flatMap((agentId) =>
        localizedEntries(`/agents/${agentId}`, { changeFrequency: 'weekly', priority: 0.5 }),
      );
    } catch (err) {
      console.error('[sitemap] agents failed:', err);
      return [];
    }
  }

  const n = parseListingFileId(String(id));
  if (n === null) return [];
  try {
    const { from, to } = listingFilePages(n);
    const rows = await fetchListingIds(from, to);
    return rows.flatMap(({ id: listingId, updatedAt }) =>
      localizedEntries(`/listing/${listingId}`, {
        changeFrequency: 'weekly',
        priority: 0.8,
        // Только реальная дата изменения содержимого (backend SEO AUD-6).
        ...(updatedAt && { lastModified: new Date(updatedAt) }),
      }),
    );
  } catch (err) {
    console.error(`[sitemap] listings file ${n} failed:`, err);
    return [];
  }
}
