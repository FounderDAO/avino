/**
 * /about — страница «О компании» (Biz haqimizda; ссылка из футера).
 * Тонкая обёртка: метаданные + рендер статичной фичи AboutPage.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AboutPage } from '@/features/about/AboutPage';
import { alternatesFor } from '@/lib/seo/alternates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: alternatesFor('/about'),
  };
}

export default function AboutRoute() {
  return <AboutPage />;
}
