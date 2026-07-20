'use client';

/**
 * AgentsCatalog — список страницы /agents с дозагрузкой «Показать ещё».
 *
 * SSR отдаёт первую страницу (AGENTS_PAGE_SIZE) и общий total; следующие
 * страницы клиент дотягивает lazy-запросом и складывает в локальный state —
 * та же схема, что у выдачи /search (SearchResults, TASK-199). Кнопка видна,
 * пока загружено меньше total.
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AGENTS_PAGE_SIZE, type Agent } from '@/lib/api/agents';
import { useLazyAgentsPageQuery } from '@/store/api/agentsApi';
import { AgentCard } from './AgentCard';

export function AgentsCatalog({
  initialAgents,
  total,
}: {
  initialAgents: Agent[];
  total: number;
}) {
  const t = useTranslations('agentsCatalog');
  const [extra, setExtra] = React.useState<Agent[]>([]);
  const [page, setPage] = React.useState(1);
  const [loadPage, { isFetching }] = useLazyAgentsPageQuery();

  const agents = React.useMemo(
    () => [...initialAgents, ...extra],
    [initialAgents, extra],
  );
  const hasMore = agents.length < total;

  const loadMore = async () => {
    if (isFetching || !hasMore) return;
    const next = page + 1;
    try {
      const res = await loadPage({ page: next, limit: AGENTS_PAGE_SIZE }).unwrap();
      setExtra((prev) => [...prev, ...res.agents]);
      setPage(next);
    } catch {
      // Сеть/5xx — страницу не двигаем, пользователь может повторить.
    }
  };

  if (agents.length === 0) {
    return <p className="text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isFetching}
          className="rounded-pill border-[1.5px] border-border px-5 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {isFetching ? t('loadingMore') : t('showMore')}
        </button>
      )}
    </div>
  );
}
