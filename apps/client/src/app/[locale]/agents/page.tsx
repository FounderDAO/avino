/**
 * Публичный каталог агентов /agents (API.md §21, ADR-0140, редизайн ADR-0148).
 *
 * Server component: SSR отдаёт каталог целиком (AGENTS_CATALOG_LIMIT = 100,
 * максимум API) + total — клиентские поиск и сортировка в AgentsCatalog должны
 * видеть весь каталог. Если агентов вдруг больше лимита, остаток дотягивает
 * кнопка «Показать ещё». Пустой каталог не 404-ит — показываем сообщение
 * (агентов может ещё не быть).
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getAgents, AGENTS_CATALOG_LIMIT } from '@/lib/api/agents';
import { AgentsCatalog } from '@/features/agents/AgentsCatalog';
import { alternatesFor } from '@/lib/seo/alternates';
import { SiteGraph } from '@/components/seo/SiteGraph';
import { PageNav } from '@/components/seo/PageNav';
import { parsePageParam } from '@/lib/seo/pagination';
import { notFound } from 'next/navigation';

/**
 * Каталог рендерится на запрос, а не пререндерится на билде: в Docker-сборке
 * API недоступен, getAgents деградирует до пустой страницы, и каталог запёкся
 * бы пустым до первой ревалидации (те же грабли, что у визарда регионов, #258).
 * Данные при этом остаются в fetch-кэше на час (revalidate в getAgents).
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const pageNum = parsePageParam((await searchParams).page) ?? 1;
  const t = await getTranslations({ locale, namespace: 'agentsCatalog' });
  const tPage = await getTranslations({ locale, namespace: 'pagination' });

  return {
    title: pageNum > 1 ? tPage('titleSuffix', { title: t('meta.title'), page: pageNum }) : t('meta.title'),
    description: t('meta.description'),
    // Страница 2+ канонична сама себе: у неё свой набор агентов.
    alternates: alternatesFor(pageNum > 1 ? `/agents?page=${pageNum}` : '/agents', locale),
  };
}

export default async function AgentsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  // ?page=N — ссылками для краулеров: агентов больше, чем помещается в один запрос API (100).
  const pageNum = parsePageParam(sp.page);
  if (pageNum === null) notFound();
  const { agents, total } = await getAgents(AGENTS_CATALOG_LIMIT, pageNum);
  if (pageNum > 1 && agents.length === 0) notFound();
  const pages = Math.max(1, Math.ceil(total / AGENTS_CATALOG_LIMIT));
  const t = await getTranslations('agentsCatalog');

  return (
    <div className="fade-up mx-auto max-w-[1280px] px-4 pb-12 pt-8 sm:px-6">
      <SiteGraph
        page={{
          path: pageNum > 1 ? `/agents?page=${pageNum}` : '/agents',
          nameKey: 'agentsCatalog.meta.title',
          type: 'CollectionPage',
        }}
      />
      {/* Hero каталога: заголовок + счётчик; панель управления — в AgentsCatalog. */}
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] text-ink sm:text-[32px]">
          {t('title')}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          {t('subtitle', { count: total })}
        </p>
      </div>
      <AgentsCatalog
        initialAgents={agents}
        total={total}
        startPage={pageNum}
        pagination={<PageNav locale={locale} pathname="/agents" searchParams={sp} page={pageNum} totalPages={pages} />}
      />
    </div>
  );
}
