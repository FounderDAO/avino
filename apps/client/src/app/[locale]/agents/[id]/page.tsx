/**
 * Публичная страница агента /agents/[id] (Task 5, API.md §21, ADR-0140).
 *
 * Server component: getAgentById(id) → notFound() при null. Объявления —
 * первая страница /search?agent_id= через searchListingsPage (та же
 * SEARCH_PAGE_SIZE, что и /search); реюз searchListingsPage/AgentProfile
 * вместо нового способа собирать SSR-выдачу.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAgentById } from '@/lib/api/agents';
import { searchListingsPage } from '@/lib/api/listings';
import { AgentProfile } from '@/features/agent/AgentProfile';
import { alternatesFor } from '@/lib/seo/alternates';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const agent = await getAgentById(id);
  const t = await getTranslations({ locale, namespace: 'agentProfile' });
  if (!agent) return { title: t('meta.notFoundTitle') };

  const title = t('meta.title', { name: agent.name ?? t('privateAgent') });
  const description = agent.about ? agent.about.slice(0, 155) : undefined;

  return {
    title,
    ...(description && { description }),
    alternates: alternatesFor(`/agents/${id}`),
  };
}

export default async function AgentPage({ params }: PageProps) {
  const { locale, id } = await params;
  const agent = await getAgentById(id);
  if (!agent) notFound();

  // Первая страница выдачи (пагинация «ещё» вне объёма Task 5, см. AgentProfile).
  const page = await searchListingsPage({ agentId: id }, locale);

  return <AgentProfile agent={agent} listings={page.listings} />;
}
