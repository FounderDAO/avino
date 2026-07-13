/**
 * Экран результата ипотечного калькулятора /listing/[id]/mortgage/result
 * (спека §5). Server component: тот же паттерн, что и /listing/[id]/mortgage —
 * достаёт листинг, 404 → notFound(). Никаких параметров расчёта в URL:
 * состояние формы/результата общее (mortgageSlice), см. MortgageResult.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getListingById } from '@/lib/api/listings';
import { MortgageResult } from '@/features/mortgage/MortgageResult';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'mortgage' });
  return { title: t('title') };
}

export default async function MortgageResultPage({ params }: PageProps) {
  const { locale, id } = await params;
  const listing = await getListingById(id, locale);
  if (!listing) notFound();

  return <MortgageResult listing={listing} />;
}
