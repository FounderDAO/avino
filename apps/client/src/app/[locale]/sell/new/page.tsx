/**
 * /sell/new — страница визарда создания объявления.
 * Рендерит клиентский ListingNew (формы — только моки, без отправки на API).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ListingNew } from '@/features/listing-new/ListingNew';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'listingNew' });
  return { title: t('meta.title'), description: t('meta.description') };
}

export default function ListingNewPage() {
  return <ListingNew />;
}
