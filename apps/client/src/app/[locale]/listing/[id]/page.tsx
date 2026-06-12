/**
 * Страница объекта /listing/[id].
 * Server component: достаёт листинг из мок-слоя; если не найден — notFound().
 * Интерактив (галерея/лайтбокс/контакт/избранное) — в дочерних 'use client'.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getListingById } from '@/lib/api/listings';
import { formatPrice } from '@/lib/format';
import { Detail } from '@/features/detail/Detail';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) return { title: 'Объявление не найдено — Avino' };
  return {
    title: `${listing.title} — ${formatPrice(listing)} | Avino`,
    description: listing.desc,
  };
}

export default async function ListingPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) notFound();
  return <Detail listing={listing} />;
}
