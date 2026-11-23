/**
 * Страница объекта /listing/[id].
 * Server component: достаёт листинг из мок-слоя; если не найден — notFound().
 * Интерактив (галерея/лайтбокс/контакт/избранное) — в дочерних 'use client'.
 *
 * SEO (ADR-0104):
 * - JSON-LD RealEstateListing + Offer + BreadcrumbList (зеркалит видимую крошку).
 * - JSON-LD генерируется серверно через <JsonLd>.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getListingState } from '@/lib/api/listings';
import { formatPrice } from '@/lib/format';
import { Detail } from '@/features/detail/Detail';
import { ListingUnavailable } from '@/features/detail/ListingUnavailable';
import { alternatesFor } from '@/lib/seo/alternates';
import { BASE } from '@/lib/seo/base';
import { JsonLd } from '@/components/seo/JsonLd';
import { metaDescription } from '@/lib/seo/text';
import { listingHeadline, listingSummary } from '@/lib/seo/listingTitle';
import { indexClosedListings, isClosedListing } from '@/lib/seo/listingStatus';
import { breadcrumbNode, listingNodes, pageGraph, webPageNode, type Crumb } from '@/lib/seo/graph';
import { openGraphBase } from '@/lib/seo/og';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const state = await getListingState(id, locale);
  const t = await getTranslations({ locale, namespace: 'listing' });
  // Удалено (410) / на проверке (503): понятный заголовок и noindex без canonical.
  if (state.kind === 'gone' || state.kind === 'under_review') {
    const reason = state.kind === 'gone' ? 'gone' : 'updating';
    return { title: t(`unavailable.${reason}.title`), robots: { index: false, follow: true } };
  }
  if (state.kind === 'not_found') return { title: t('meta.notFoundTitle') };
  const { listing } = state;
  const tUnits = await getTranslations({ locale, namespace: 'units' });
  const price = formatPrice(listing, tUnits);
  // Заголовок — из полей объекта, а не из свободного title автора (обычно это адрес).
  const headline = listingHeadline(listing, t, tUnits);
  const title = t('meta.title', { title: headline, price });

  // Без текста автора — связное предложение из полей, а не сырые enum-значения.
  const description = metaDescription(listing.desc || listingSummary(listing, price, t, tUnits));

  // og:image указывает на стабильный route /api/og/listing/:id (а не на presigned
  // R2-ссылку с TTL 1ч), чтобы превью соцсетей не «протухало». Фолбэк-картинку
  // обеспечивает сам маршрут, поэтому og:image отдаём всегда.
  const ogImages = [{ url: `/api/og/listing/${id}`, alt: headline }];

  // Закрытые (SOLD/RENTED) — по решению владельца (флаг INDEX_CLOSED_LISTINGS):
  // при false — noindex, follow и без canonical/hreflang.
  const noindex = isClosedListing(listing) && !indexClosedListings();

  return {
    title,
    description,
    ...(noindex
      ? { robots: { index: false, follow: true } }
      : { alternates: alternatesFor(`/listing/${id}`, locale) }),
    openGraph: {
      ...openGraphBase(locale),
      title,
      description,
      url: `${BASE}/${locale}/listing/${id}`,
      images: ogImages,
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function ListingPage({ params }: PageProps) {
  const { locale, id } = await params;
  const state = await getListingState(id, locale);
  // Статус 410/503 ставит middleware; notFound() переписал бы его на 404.
  if (state.kind === 'gone') return <ListingUnavailable reason="gone" />;
  if (state.kind === 'under_review') return <ListingUnavailable reason="updating" />;
  if (state.kind === 'not_found') notFound();
  const { listing } = state;

  const tCrumb = await getTranslations({ locale, namespace: 'breadcrumb' });
  const tListing = await getTranslations({ locale, namespace: 'listing' });
  const tUnits = await getTranslations({ locale, namespace: 'units' });
  const headline = listingHeadline(listing, tListing, tUnits);

  // ─── BreadcrumbList: Главная › Купить/Аренда › Район › Текущее ─────────
  const txCrumbKey = listing.tx === 'RENT' ? 'rent' : 'sale';
  const txCrumbLabel = tCrumb(txCrumbKey);
  const txCrumbPath = `/search?tx=${listing.tx}`;

  // ─── JSON-LD: один @graph — организация, сайт, объявление, агент, крошки ───
  const pageUrl = `${BASE}/${locale}/listing/${id}`;
  const crumbs: Crumb[] = [
    { name: tCrumb('home'), url: `${BASE}/${locale}` },
    { name: txCrumbLabel, url: `${BASE}/${locale}${txCrumbPath}` },
    ...(listing.district
      ? [
          {
            name: listing.district,
            // Ссылка на выдачу именно по этому району, а не на общий «Купить/Аренда».
            url: listing.districtId
              ? `${BASE}/${locale}/search?tx=${listing.tx}&district_id=${listing.districtId}`
              : `${BASE}/${locale}/search?tx=${listing.tx}`,
          },
        ]
      : []),
    { name: headline, url: pageUrl },
  ];
  // Продавец-агент: owner_id объявления агента = id его публичного профиля /agents/[id].
  // Частного владельца в разметку не выводим (имя — персональные данные).
  const seller =
    listing.agent.kind !== 'owner' && listing.ownerId
      ? { id: listing.ownerId, name: listing.agent.name || listing.agent.agency || 'Avino agent' }
      : undefined;
  const graph = pageGraph(locale, [
    webPageNode({
      url: pageUrl,
      name: headline,
      locale,
      type: 'ItemPage',
      breadcrumbId: `${pageUrl}#breadcrumb`,
      mainEntityId: `${pageUrl}#listing`,
    }),
    ...listingNodes({ listing, locale, headline, agent: seller }),
    breadcrumbNode(pageUrl, crumbs),
  ]);

  return (
    <>
      <JsonLd data={graph} />
      <Detail
        listing={listing}
        breadcrumb={{
          homeLabel: tCrumb('home'),
          txLabel: txCrumbLabel,
          txPath: txCrumbPath,
        }}
      />
    </>
  );
}
