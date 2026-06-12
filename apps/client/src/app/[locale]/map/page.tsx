/**
 * Страница поиска по карте /map — server component (TASK-152).
 *
 * Отдаёт стартовую выдачу (SSR, промо-приоритет) для немедленного контента и
 * SEO, дальше интерактив берёт на себя клиентский MapSearch: поиск по видимой
 * области (RTK Query searchByBounds) и рисование территории. Карта — Yandex
 * Maps (CLAUDE.md §12).
 */
import { getTranslations } from 'next-intl/server';
import { searchListings } from '@/lib/api/listings';
import type { ListingFilter, TransactionType } from '@/lib/mock/types';
import { MapSearch } from '@/features/map/MapSearch';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'search' });
  return { title: t('map.metaTitle'), description: t('map.metaDescription') };
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MapPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const sp = await searchParams;

  const tx: TransactionType | undefined =
    first(sp.tx) === 'RENT' ? 'RENT' : first(sp.tx) === 'SALE' ? 'SALE' : undefined;
  const filter: ListingFilter = tx ? { tx } : {};

  const initialListings = await searchListings(filter, locale, 50);

  return (
    <div className="fade-up">
      <MapSearch initialListings={initialListings} locale={locale} tx={tx} />
    </div>
  );
}
