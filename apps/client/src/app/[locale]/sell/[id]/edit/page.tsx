/**
 * /sell/[id]/edit — страница редактирования собственного объявления.
 * Серверная обёртка: предварительно загружает справочники регионов и районов,
 * передаёт в клиентский ListingEdit (зеркало /sell/new/page.tsx).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ListingEdit } from '@/features/listing-edit/ListingEdit';
import { getRegions, getDistricts } from '@/lib/api/geo';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'listingEdit' });
  return { title: t('meta.title'), description: t('meta.description') };
}

export default async function ListingEditPage({ params }: PageProps) {
  const { locale, id } = await params;
  const [regions, districts] = await Promise.all([
    getRegions(locale),
    getDistricts(locale),
  ]);
  return <ListingEdit id={id} regions={regions} districts={districts} />;
}
