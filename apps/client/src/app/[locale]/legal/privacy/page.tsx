/**
 * /legal/privacy — Политика конфиденциальности Avino.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/features/legal/LegalDocument';
import { getLegalDoc } from '@/content/legal';
import { alternatesFor } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  return {
    title: t('meta.privacy.title'),
    description: t('meta.privacy.description'),
    alternates: alternatesFor('/legal/privacy'),
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <LegalDocument doc={getLegalDoc('privacy', locale as Locale)} locale={locale as Locale} />;
}
