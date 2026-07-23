/**
 * /sell/new — страница визарда создания объявления.
 * Server component: предварительно загружает справочники регионов и районов,
 * передаёт их в клиентский ListingNew.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ListingNew } from '@/features/listing-new/ListingNew';
import { getRegions, getDistricts } from '@/lib/api/geo';
import type { TransactionType } from '@/lib/mock';

// Справочники регионов/районов грузятся с API на сервере. Без этого Next
// статически пререндерит страницу на build (API недоступен) → пустые списки.
export const dynamic = 'force-dynamic';

interface PageProps {
  // В Next 15 params/searchParams — асинхронные.
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tx?: string }>;
}

/** Предвыбор типа сделки из ?tx (например «Сдать в аренду» → ?tx=rent). */
function parseInitialTx(raw: string | undefined): TransactionType | undefined {
  const v = raw?.toUpperCase();
  return v === 'SALE' || v === 'RENT' ? v : undefined;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'listingNew' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    robots: { index: false, follow: false },
  };
}

export default async function ListingNewPage({ params, searchParams }: PageProps) {
  const [{ locale }, { tx }] = await Promise.all([params, searchParams]);
  const [regions, districts] = await Promise.all([
    getRegions(locale),
    getDistricts(locale),
  ]);
  return (
    <ListingNew
      regions={regions}
      districts={districts}
      initialTx={parseInitialTx(tx)}
    />
  );
}
