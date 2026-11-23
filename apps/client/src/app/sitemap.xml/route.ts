/**
 * /sitemap.xml — индекс карт сайта. Next 15 по generateSitemaps() в
 * app/sitemap.ts отдаёт только файлы /sitemap/<id>.xml; индекс строим здесь
 * из тех же id (число файлов объявлений — по текущему total, кэш на час).
 */
import { BASE } from '@/lib/seo/base';
import { sitemapIds, sitemapIndexXml } from '@/lib/seo/sitemapIndex';
import { fetchLandingPaths, fetchListingTotal } from '@/lib/seo/sitemapData';

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const [total, landings] = await Promise.all([
    fetchListingTotal(),
    fetchLandingPaths().catch(() => []),
  ]);
  // Пустой файл в индексе выглядит как сломанный источник (skill seo-geo-audit-fix):
  // landings показываем, только когда есть непустые лендинги.
  const ids = sitemapIds(total).filter((id) => id !== 'landings' || landings.length > 0);
  const xml = sitemapIndexXml(BASE, ids);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
