/**
 * Экран ввода параметров ипотечного калькулятора /listing/[id]/mortgage
 * (спека §4). Server component: достаёт листинг тем же lib/api/listings,
 * что и /listing/[id]; 404 → notFound() (ближайший not-found.tsx у [id]
 * подхватывает и эту вложенную страницу). Интерактив — в клиентском MortgageForm.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getListingById } from '@/lib/api/listings';
import { MortgageForm } from '@/features/mortgage/MortgageForm';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'mortgage' });
  return { title: t('title') };
}

export default async function MortgageCalculatorPage({ params }: PageProps) {
  const { locale, id } = await params;
  const listing = await getListingById(id, locale);
  if (!listing) notFound();

  return <MortgageForm listing={listing} />;
}
