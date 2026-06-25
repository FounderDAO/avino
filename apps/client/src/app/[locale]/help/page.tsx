/**
 * /help — справочный центр Avino.
 * Server-страница: метаданные + рендер фичи Help (внутри неё клиентский аккордеон).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Help } from '@/features/help/Help';
import { alternatesFor } from '@/lib/seo/alternates';

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
    alternates: alternatesFor('/help'),
  };
}

export default function HelpPage() {
  return <Help />;
}
