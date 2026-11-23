/**
 * /help — справочный центр Avino.
 * Server-страница: метаданные + рендер фичи Help (внутри неё клиентский аккордеон).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Help } from '@/features/help/Help';
import { alternatesFor } from '@/lib/seo/alternates';
import { BASE } from '@/lib/seo/base';
import { faqNode } from '@/lib/seo/graph';
import { HELP_FAQ } from '@/features/help/faqItems';
import { SiteGraph } from '@/components/seo/SiteGraph';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'help' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: alternatesFor('/help', locale),
  };
}

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'help' });
  // FAQPage — те же вопросы, что рендерит аккордеон справки (HELP_FAQ).
  const faq = faqNode(
    `${BASE}/${locale}/help`,
    HELP_FAQ.map(([, key]) => ({ q: t(`faq.items.${key}.q`), a: t(`faq.items.${key}.a`) })),
  );
  return (
    <>
      <SiteGraph nodes={[faq]} page={{ path: '/help', nameKey: 'help.meta.title' }} />
      <Help />
    </>
  );
}
