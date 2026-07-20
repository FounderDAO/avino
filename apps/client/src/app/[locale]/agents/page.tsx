/**
 * Публичный каталог агентов /agents (API.md §21, ADR-0140).
 *
 * Server component: SSR отдаёт первую страницу каталога + total, дальнейшие
 * страницы дотягивает клиент («Показать ещё» в AgentsCatalog). Пустой каталог
 * не 404-ит — показываем сообщение (агентов может ещё не быть).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getAgents, AGENTS_PAGE_SIZE } from '@/lib/api/agents';
import { SectionTitle } from '@/components/ui/section-title';
import { AgentsCatalog } from '@/features/agents/AgentsCatalog';
import { alternatesFor } from '@/lib/seo/alternates';

/**
 * Каталог рендерится на запрос, а не пререндерится на билде: в Docker-сборке
 * API недоступен, getAgents деградирует до пустой страницы, и каталог запёкся
 * бы пустым до первой ревалидации (те же грабли, что у визарда регионов, #258).
 * Данные при этом остаются в fetch-кэше на час (revalidate в getAgents).
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'agentsCatalog' });

  return {
    title: t('meta.title'),
    description: t('meta.description'),
    alternates: alternatesFor('/agents'),
  };
}

export default async function AgentsPage() {
  const { agents, total } = await getAgents(AGENTS_PAGE_SIZE);
  const t = await getTranslations('agentsCatalog');

  return (
    <div className="fade-up mx-auto max-w-[1280px] px-4 pb-12 pt-8 sm:px-6">
      <SectionTitle title={t('title')} subtitle={t('subtitle', { count: total })} />
      <AgentsCatalog initialAgents={agents} total={total} />
    </div>
  );
}
