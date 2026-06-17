/**
 * /sell/[id]/edit — страница редактирования собственного объявления.
 * Тонкая серверная обёртка: метаданные + клиентский ListingEdit, который сам
 * грузит объявление по id (Bearer) и шлёт PATCH /listings/:id.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ListingEdit } from '@/features/listing-edit/ListingEdit';

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
  const { id } = await params;
  return <ListingEdit id={id} />;
}
