/**
 * /become-agent — заявка «Стать агентом» (ADR-0140).
 * Тонкая обёртка: метаданные + рендер клиентской фичи (auth-гейт + RTK Query
 * внутри BecomeAgent, серверный префетч не нужен — зеркалит /sell/new).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BecomeAgent } from '@/features/become-agent/BecomeAgent';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'becomeAgent' });
  return {
    title: t('meta.title'),
    description: t('meta.description'),
    robots: { index: false, follow: false },
  };
}

export default function BecomeAgentPage() {
  return <BecomeAgent />;
}
