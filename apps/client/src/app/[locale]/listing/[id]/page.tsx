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
import { getListingById } from '@/lib/api/listings';
import { formatPrice } from '@/lib/format';
import { Detail } from '@/features/detail/Detail';
import { alternatesFor } from '@/lib/seo/alternates';
import { BASE } from '@/lib/seo/base';
import { JsonLd } from '@/components/seo/JsonLd';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const listing = await getListingById(id, locale);
  const t = await getTranslations({ locale, namespace: 'listing' });
  if (!listing) return { title: t('meta.notFoundTitle') };
  const tUnits = await getTranslations({ locale, namespace: 'units' });
  const price = formatPrice(listing, tUnits);
  const title = t('meta.title', { title: listing.title, price });

  // Fallback для description если desc пустой: тип + район + цена
  const descFallback = `${listing.type} · ${listing.district} · ${price}`;
  const description = (listing.desc ?? descFallback).slice(0, 155);

  // og:image указывает на стабильный route /api/og/listing/:id (а не на presigned
  // R2-ссылку с TTL 1ч), чтобы превью соцсетей не «протухало». Фолбэк-картинку
  // обеспечивает сам маршрут, поэтому og:image отдаём всегда.
  const ogImages = [{ url: `/api/og/listing/${id}`, alt: listing.title }];

  return {
    title,
    description,
    alternates: alternatesFor(`/listing/${id}`),
    openGraph: {
      type: 'website',
      siteName: 'Avino',
      title,
      description,
      url: `${BASE}/${locale}/listing/${id}`,
      images: ogImages,
      locale,
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function ListingPage({ params }: PageProps) {
  const { locale, id } = await params;
  const listing = await getListingById(id, locale);
  if (!listing) notFound();

  const tCrumb = await getTranslations({ locale, namespace: 'breadcrumb' });

  // ─── BreadcrumbList: Главная › Купить/Аренда › Район › Текущее ─────────
  const txCrumbKey = listing.tx === 'RENT' ? 'rent' : 'sale';
  const txCrumbLabel = tCrumb(txCrumbKey);
  const txCrumbPath = `/search?tx=${listing.tx}`;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: tCrumb('home'),
        item: `${BASE}/${locale}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: txCrumbLabel,
        item: `${BASE}/${locale}${txCrumbPath}`,
      },
      ...(listing.district
        ? [
            {
              '@type': 'ListItem',
              position: 3,
              name: listing.district,
              item: `${BASE}/${locale}/search?tx=${listing.tx}`,
            },
            {
              '@type': 'ListItem',
              position: 4,
              name: listing.title,
              item: `${BASE}/${locale}/listing/${id}`,
            },
          ]
        : [
            {
              '@type': 'ListItem',
              position: 3,
              name: listing.title,
              item: `${BASE}/${locale}/listing/${id}`,
            },
          ]),
    ],
  };

  // ─── RealEstateListing + Offer ─────────────────────────────────────────────
  // tx=RENT → businessFunction LeaseOut, tx=SALE → Sell
  const businessFunction =
    listing.tx === 'RENT'
      ? 'http://purl.org/goodrelations/v1#LeaseOut'
      : 'http://purl.org/goodrelations/v1#Sell';

  const listingJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: listing.title,
    description: listing.desc ?? undefined,
    url: `${BASE}/${locale}/listing/${id}`,
    datePosted: listing.createdAt,
    ...(listing.photos.length > 0 && {
      image: listing.photos.map((p) => p.url),
    }),
    offers: {
      '@type': 'Offer',
      price: listing.price,
      priceCurrency: listing.currency,
      availability: 'https://schema.org/InStock',
      businessFunction,
    },
    ...(listing.lat != null && listing.lng != null && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: listing.lat,
        longitude: listing.lng,
      },
    }),
    address: {
      '@type': 'PostalAddress',
      addressLocality: listing.district || undefined,
      addressRegion: 'Toshkent',
      addressCountry: 'UZ',
      ...(listing.address && { streetAddress: listing.address }),
    },
  };

  return (
    <>
      <JsonLd data={listingJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
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
