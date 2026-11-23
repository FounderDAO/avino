/**
 * robots.ts — Next.js App Router Metadata file.
 * Генерирует /robots.txt: объявляет карту сайта, запрещает crawl приватных страниц.
 *
 * Поисковые и AI-боты перечислены явно с теми же правилами: краулер, нашедший
 * свою группу, игнорирует группу `*`, поэтому disallow повторяем в каждой.
 */
import type { MetadataRoute } from 'next';
import { BASE } from '@/lib/seo/base';

/** Disallow лишь экономит обход; из индекса держит noindex на самих страницах. */
// /api/ не закрываем: картинки объявлений в JSON-LD и og:image идут через /api/og.
export const DISALLOW = ['/*/account/', '/*/sell/new', '/*/sell/*/edit'];

/** Поисковики и AI-ассистенты, которым явно открыт сайт (GEO). */
export const NAMED_BOTS = [
  'Googlebot',
  'Bingbot',
  'YandexBot',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      ...NAMED_BOTS.map((userAgent) => ({ userAgent, allow: '/', disallow: DISALLOW })),
    ],
    sitemap: `${BASE}/sitemap.xml`,
    // Host — директива Яндекса (главное зеркало).
    host: BASE,
  };
}
