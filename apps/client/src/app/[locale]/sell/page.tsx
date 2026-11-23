/**
 * /sell — лендинг «Продать/Сдать» для собственников и агентов.
 * Server component: рендерит секции Sell (интерактив — внутри SellFaq).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Sell } from '@/features/sell/Sell';
import { alternatesFor } from '@/lib/seo/alternates';
import { BASE } from '@/lib/seo/base';
import { faqNode } from '@/lib/seo/graph';
import { SELL_FAQ_KEYS } from '@/features/sell/faqKeys';
import { SiteGraph } from '@/components/seo/SiteGraph';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sell' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: alternatesFor('/sell', locale),
  };
}

export default async function SellPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'sell' });
  // FAQPage — те же пункты, что рендерит SellFaq (SELL_FAQ_KEYS).
  const faq = faqNode(
    `${BASE}/${locale}/sell`,
    SELL_FAQ_KEYS.map((key) => ({ q: t(`faq.items.${key}.q`), a: t(`faq.items.${key}.a`) })),
  );
  return (
    <>
      <SiteGraph nodes={[faq]} page={{ path: '/sell', nameKey: 'sell.meta.title' }} />
      <Sell />
    </>
  );
}
