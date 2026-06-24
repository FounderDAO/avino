/**
 * robots.ts — Next.js App Router Metadata file.
 * Генерирует /robots.txt: объявляет карту сайта, запрещает crawl приватных страниц.
 */
import type { MetadataRoute } from 'next';
import { BASE } from '@/lib/seo/base';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/*/account/', '/*/sell/new'],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
