/**
 * Страница объекта /listing/[id].
 * Server component: достаёт листинг из мок-слоя; если не найден — notFound().
 * Интерактив (галерея/лайтбокс/контакт/избранное) — в дочерних 'use client'.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getListingById } from '@/lib/api/listings';
import { formatPrice } from '@/lib/format';
import { Detail } from '@/features/detail/Detail';
import { alternatesFor } from '@/lib/seo/alternates';
import { BASE } from '@/lib/seo/base';

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

  const ogImages = listing.photos[0]
    ? [{ url: listing.photos[0].url, width: 1200, height: 630, alt: listing.title }]
    : [];

  return {
    title,
    description,
    alternates: alternatesFor(`/listing/${id}`),
    openGraph: {
      type: 'website',
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
  return <Detail listing={listing} />;
}
