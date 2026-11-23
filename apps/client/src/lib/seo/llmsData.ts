/**
 * Данные для llms.txt: число объявлений, топ районов, свежие объявления.
 * Всё из API с кэшем на час (те же ответы, что у sitemap).
 */
import { getTranslations } from 'next-intl/server';
import { getDistricts } from '@/lib/api/geo';
import { formatPrice } from '@/lib/format';
import { buildLlmsTxt, LLMS_LOCALES, type LlmsLocaleBlock } from './llms';
import { listingHeadline } from './listingTitle';
import { BASE } from './base';
import { fetchDistrictCounts, fetchListingTotal, fetchRecentListings, type DistrictCount } from './sitemapData';

/** Сколько районов на сделку показывать. */
const TOP_DISTRICTS = 10;
/** Объявлений в llms-full.txt. */
export const LLMS_FULL_LISTINGS = 200;

function topDistricts(counts: DistrictCount[]): DistrictCount[] {
  const sale = counts.filter((c) => c.tx === 'SALE').slice(0, TOP_DISTRICTS);
  const rent = counts.filter((c) => c.tx === 'RENT').slice(0, TOP_DISTRICTS);
  return [...sale, ...rent];
}

export async function renderLlmsTxt(full: boolean): Promise<string> {
  const [total, counts] = await Promise.all([
    fetchListingTotal(),
    fetchDistrictCounts().catch((err) => {
      console.error('[llms] district counts failed:', err);
      return [] as DistrictCount[];
    }),
  ]);
  const top = topDistricts(counts);

  const blocks: LlmsLocaleBlock[] = await Promise.all(
    LLMS_LOCALES.map(async (locale) => {
      const [t, districts] = await Promise.all([
        getTranslations({ locale, namespace: 'llms' }),
        getDistricts(locale),
      ]);
      const names = new Map(districts.map((d) => [d.id, d.name]));
      const block: LlmsLocaleBlock = {
        locale,
        t: (k, v) => t(k as never, v as never),
        districts: top
          .filter((d) => names.has(d.districtId))
          .map((d) => ({ ...d, name: names.get(d.districtId)! })),
      };
      // Список объявлений — один раз, в русском блоке (на других языках — те же id).
      if (full && locale === 'ru') {
        const [tListing, tUnits, recent] = await Promise.all([
          getTranslations({ locale, namespace: 'listing' }),
          getTranslations({ locale, namespace: 'units' }),
          fetchRecentListings(LLMS_FULL_LISTINGS, locale).catch((err) => {
            console.error('[llms] recent listings failed:', err);
            return [];
          }),
        ]);
        const tl = (k: string, v?: Record<string, string | number>) => tListing(k as never, v as never);
        const tu = (k: string, v?: Record<string, string | number>) => tUnits(k as never, v as never);
        block.listings = recent.map((l) => ({ id: l.id, headline: listingHeadline(l, tl, tu), price: formatPrice(l, tu) }));
      }
      return block;
    }),
  );

  return buildLlmsTxt(total, blocks, full ? undefined : `${BASE}/llms-full.txt`);
}
