/**
 * sitemap.ts — динамическая карта сайта (MetadataRoute.Sitemap, Next.js App Router).
 *
 * Статические роуты + все активные объявления, страницы по каждой локали.
 * Объявления тянутся постранично через /api/v1/search (limit=100, keyset-курсор).
 *
 * Потолок: MAX_PAGES страниц × 100 = 5 000 объявлений. Если объявлений больше —
 * в серверном логе появляется предупреждение с числом пропущенных; сайтмап всё
 * равно возвращает все собранные записи (не падает 500).
 *
 * При ошибке API сайтмап деградирует до статических роутов.
 */
import type { MetadataRoute } from 'next';
import { BASE } from '@/lib/seo/base';
import { routing } from '@/i18n/routing';
import { resolveApiBase } from '@/lib/api/base';
import type { SearchEnvelope } from '@/lib/api/listings';

const { locales, defaultLocale } = routing;

/** Максимум страниц поиска для сбора ID объявлений (100 шт/страница). */
const MAX_PAGES = 50; // до 5 000 объявлений
const PAGE_LIMIT = 100;

// ─── Вспомогательные ──────────────────────────────────────────────────────────

/** Alternate-блок для локалей (url включает /locale/ префикс). */
function localeAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale] = `${BASE}/${locale}${path}`;
  }
  languages['x-default'] = `${BASE}/${defaultLocale}${path}`;
  return languages;
}

/** Сайтмап-запись для статического роута. */
function staticEntry(
  path: string,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] = 'weekly',
): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE}/${defaultLocale}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: { languages: localeAlternates(path) },
  };
}

// ─── Статические роуты ────────────────────────────────────────────────────────

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  staticEntry('/', 1.0, 'daily'),
  staticEntry('/search?tx=SALE', 0.9, 'daily'),
  staticEntry('/search?tx=RENT', 0.9, 'daily'),
  staticEntry('/sell', 0.7, 'monthly'),
  staticEntry('/help', 0.5, 'monthly'),
  staticEntry('/map', 0.8, 'daily'),
];

// ─── Сбор ID объявлений ───────────────────────────────────────────────────────

interface ListingIdEntry {
  id: string;
  updatedAt: string | null;
  createdAt: string;
}

/**
 * Тянет все объявления постранично через keyset-курсор.
 * При ошибке возвращает пустой массив — сайтмап деградирует до статики.
 */
async function fetchAllListingEntries(): Promise<ListingIdEntry[]> {
  const entries: ListingIdEntry[] = [];
  let cursor: string | null = null;
  let page = 0;

  try {
    const apiBase = resolveApiBase();

    do {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`${apiBase}/search?${params.toString()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Accept-Language': 'ru' },
      });

      if (!res.ok) {
        console.error(`[sitemap] search API ${res.status} on page ${page} — using partial result`);
        break;
      }

      const env: SearchEnvelope = await res.json();

      for (const item of env.data) {
        entries.push({
          id: item.id,
          // API поиска возвращает created_at; updated_at не в контракте краткой карточки
          updatedAt: null,
          createdAt: item.created_at,
        });
      }

      cursor = env.meta.next_cursor;
      page++;

      if (page >= MAX_PAGES && cursor !== null) {
        const approxRemaining = env.meta.total - entries.length;
        console.warn(
          `[sitemap] hit MAX_PAGES=${MAX_PAGES} limit (${MAX_PAGES * PAGE_LIMIT} listings indexed). ` +
          `Skipping ~${approxRemaining} more listings (total API: ${env.meta.total}).`,
        );
        break;
      }
    } while (cursor !== null);
  } catch (err) {
    console.error('[sitemap] failed to fetch listings, returning static-only sitemap:', err);
    return [];
  }

  return entries;
}

// ─── Экспорт ──────────────────────────────────────────────────────────────────

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await fetchAllListingEntries();

  const listingEntries: MetadataRoute.Sitemap = entries.map(({ id, updatedAt, createdAt }) => {
    const path = `/listing/${id}`;
    const lastModified = new Date(updatedAt ?? createdAt);
    return {
      url: `${BASE}/${defaultLocale}${path}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      alternates: { languages: localeAlternates(path) },
    };
  });

  return [...STATIC_ROUTES, ...listingEntries];
}
