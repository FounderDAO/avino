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

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const listing = await getListingById(id, locale);
  if (!listing) return { title: 'Объявление не найдено — Avino' };
  const tUnits = await getTranslations({ locale, namespace: 'units' });
  return {
    title: `${listing.title} — ${formatPrice(listing, tUnits)} | Avino`,
    description: listing.desc,
  };
}

export default async function ListingPage({ params }: PageProps) {
  const { locale, id } = await params;
  const listing = await getListingById(id, locale);
  if (!listing) notFound();
  return <Detail listing={listing} />;
}
