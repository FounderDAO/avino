/**
 * /sell — лендинг «Продать/Сдать» для собственников и агентов.
 * Server component: рендерит секции Sell (интерактив — внутри SellFaq).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Sell } from '@/features/sell/Sell';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sell' });
  return { title: t('meta.title'), description: t('meta.description') };
}

export default function SellPage() {
  return <Sell />;
}
