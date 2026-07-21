/**
 * /legal/privacy — Политика конфиденциальности Avino.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/features/legal/LegalDocument';
import { getLegalDoc } from '@/content/legal';
import { alternatesFor } from '@/lib/seo/alternates';
import type { Locale } from '@/i18n/routing';
import { fetchLegalDoc, toLegalDoc } from '@/lib/api/legal';

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
  // API-версия (админ публиковал) или вшитый фолбэк (пусто/API недоступен).
  const apiDoc = await fetchLegalDoc('privacy', locale);
  const doc = apiDoc ? toLegalDoc(apiDoc) : getLegalDoc('privacy', locale as Locale);
  return <LegalDocument doc={doc} locale={locale as Locale} />;
}
