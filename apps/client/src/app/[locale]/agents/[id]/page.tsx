/**
 * Публичная страница агента /agents/[id] (Task 5, API.md §21, ADR-0140).
 *
 * Server component: getAgentById(id) → notFound() при null. Объявления —
 * выдача /search?agent_id= через searchListingsPageAt (та же SEARCH_PAGE_SIZE,
 * что и /search) с номерными страницами `?page=N` для краулеров: страница 2+
 * канонична сама себе, за пределами выдачи — 404.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAgentById } from '@/lib/api/agents';
import { SEARCH_PAGE_SIZE, searchListingsPageAt } from '@/lib/api/listings';
import { AgentProfile } from '@/features/agent/AgentProfile';
import { PageNav } from '@/components/seo/PageNav';
import { alternatesFor, localeUrl } from '@/lib/seo/alternates';
import { parsePageParam, totalPages } from '@/lib/seo/pagination';
import { metaDescription } from '@/lib/seo/text';
import { isAgentIndexable } from '@/lib/seo/agentIndex';
import { agentId, agentNode } from '@/lib/seo/graph';
import { SiteGraph } from '@/components/seo/SiteGraph';

interface PageProps {
  // В Next 15 params — асинхронные.
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  const pageNum = parsePageParam((await searchParams).page) ?? 1;
  const agent = await getAgentById(id);
  const t = await getTranslations({ locale, namespace: 'agentProfile' });
  if (!agent) return { title: t('meta.notFoundTitle') };

  // Имя как на странице: агент, затем агентство, затем «Частный маклер».
  const displayName = agent.name?.trim() || agent.agencyName || t('privateAgent');
  const name = t('meta.title', { name: displayName });
  const tPage = await getTranslations({ locale, namespace: 'pagination' });
  const title = pageNum > 1 ? tPage('titleSuffix', { title: name, page: pageNum }) : name;
  // Description — шаблон на языке страницы (имя + число объявлений): уникален
  // для каждого агента и не дублирует общий текст сайта. Текст «О себе» —
  // на языке автора, он остаётся в теле страницы.
  const description = metaDescription(
    t('meta.description', { name: displayName, count: agent.activeListingsCount ?? 0 }),
  );
  const path = pageNum > 1 ? `/agents/${id}?page=${pageNum}` : `/agents/${id}`;

  return {
    title,
    description,
    // Почти пустой профиль (без «О себе» и с 1–2 объявлениями) — noindex, follow.
    ...(isAgentIndexable(agent)
      ? { alternates: alternatesFor(path, locale) }
      : { robots: { index: false, follow: true } }),
  };
}

export default async function AgentPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  const sp = await searchParams;
  const pageNum = parsePageParam(sp.page);
  if (pageNum === null) notFound();
  const agent = await getAgentById(id);
  if (!agent) notFound();

  const page = await searchListingsPageAt({ agentId: id }, locale, pageNum);
  if (!page) notFound();

  // RealEstateAgent; аватар не выводим — это presigned R2-ссылка с TTL 1ч.
  const tProfile = await getTranslations({ locale, namespace: 'agentProfile' });
  const tCrumb = await getTranslations({ locale, namespace: 'breadcrumb' });
  const tCatalog = await getTranslations({ locale, namespace: 'agentsCatalog' });
  const displayName = agent.name?.trim() || agent.agencyName || tProfile('privateAgent');
  const graphNode = agentNode(locale, {
    id,
    name: displayName,
    about: agent.about,
    agencyName: agent.agencyName,
  });

  return (
    <>
      <SiteGraph
        nodes={[graphNode]}
        page={{
          path: `/agents/${id}`,
          name: displayName,
          type: 'ProfilePage',
          mainEntityId: agentId(locale, id),
          crumbs: [
            { name: tCrumb('home'), url: localeUrl(locale, '/') },
            { name: tCatalog('meta.title'), url: localeUrl(locale, '/agents') },
            { name: displayName, url: localeUrl(locale, `/agents/${id}`) },
          ],
        }}
      />
      <AgentProfile
        agent={agent}
        listings={page.listings}
        pagination={
          <PageNav
            locale={locale}
            pathname={`/agents/${id}`}
            searchParams={sp}
            page={pageNum}
            totalPages={totalPages(page.total, SEARCH_PAGE_SIZE)}
          />
        }
      />
    </>
  );
}
