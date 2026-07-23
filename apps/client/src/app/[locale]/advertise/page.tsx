/**
 * /advertise — лендинг «Рекламодателям» (ссылка из футера).
 * Тонкая обёртка: метаданные + рендер статичной фичи AdvertisePage.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdvertisePage } from '@/features/advertise/AdvertisePage';
import { alternatesFor } from '@/lib/seo/alternates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'advertise' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: alternatesFor('/advertise'),
  };
}

export default function AdvertiseRoute() {
  return <AdvertisePage />;
}
