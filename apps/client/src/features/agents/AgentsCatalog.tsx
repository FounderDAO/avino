'use client';

/**
 * AgentsCatalog — интерактивная часть страницы /agents (ADR-0148):
 * панель управления (поиск + сортировка + счётчик) и список строк AgentRow.
 *
 * SSR отдаёт весь каталог одним запросом (AGENTS_CATALOG_LIMIT = 100, максимум
 * API), поэтому поиск и сортировка — локальные, по массиву в памяти: ищем по
 * ВСЕМУ каталогу, а не по подгруженному куску, и без похода в сеть на каждую
 * букву (debounce не нужен). Кнопка «Показать ещё» осталась на случай, когда
 * агентов станет больше лимита; при активном поиске она скрыта — дотянутая
 * страница всё равно не попала бы в фильтр, а счётчик «Найдено N» дёргался бы.
 */
import * as React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Search, ChevronDown, X } from 'lucide-react';
import { AGENTS_CATALOG_LIMIT, type Agent } from '@/lib/api/agents';
import { useLazyAgentsPageQuery } from '@/store/api/agentsApi';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from '@/components/ui/dropdown';
import { AgentRow } from './AgentRow';

/** Порядок списка. `active` — как отдаёт API (по числу активных объявлений). */
type SortKey = 'active' | 'name';

const SORTS: SortKey[] = ['active', 'name'];

export function AgentsCatalog({
  initialAgents,
  total,
}: {
  initialAgents: Agent[];
  total: number;
}) {
  const t = useTranslations('agentsCatalog');
  const locale = useLocale();
  const [extra, setExtra] = React.useState<Agent[]>([]);
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<SortKey>('active');
  const [loadPage, { isFetching }] = useLazyAgentsPageQuery();

  const agents = React.useMemo(
    () => [...initialAgents, ...extra],
    [initialAgents, extra],
  );

  const visible = React.useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale);
    const found = q
      ? agents.filter((a) =>
          `${a.name ?? ''} ${a.agencyName ?? ''}`.toLocaleLowerCase(locale).includes(q),
        )
      : agents;

    if (sort !== 'name') return found;
    // Агенты без имени — в конец: сортировка по имени про них ничего не говорит.
    return [...found].sort((a, b) => {
      if (!a.name) return b.name ? 1 : 0;
      if (!b.name) return -1;
      return a.name.localeCompare(b.name, locale);
    });
  }, [agents, query, sort, locale]);

  // Дотягивать имеет смысл только пока не фильтруем: поиск идёт по памяти.
  const hasMore = agents.length < total && !query.trim();

  const loadMore = async () => {
    if (isFetching || !hasMore) return;
    const next = page + 1;
    try {
      const res = await loadPage({ page: next, limit: AGENTS_CATALOG_LIMIT }).unwrap();
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
    <div className="flex flex-col gap-5">
      {/* Панель управления: поиск слева, сортировка справа. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-[420px]">
          <Search
            size={17}
            strokeWidth={2}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-11 w-full rounded-pill border-[1.5px] border-border bg-surface pl-10 pr-4 text-[14.5px] text-ink outline-none transition-colors placeholder:text-muted-foreground focus:border-ink"
          />
        </div>

        <Dropdown>
          <DropdownTrigger asChild>
            <button
              type="button"
              className="flex h-11 shrink-0 items-center gap-1.5 self-start rounded-pill border-[1.5px] border-border px-4 text-[14px] font-bold text-ink transition-colors hover:border-ink sm:self-auto"
            >
              {t(`sort.${sort}`)}
              <ChevronDown size={15} strokeWidth={2} />
            </button>
          </DropdownTrigger>
          <DropdownContent>
            {SORTS.map((key) => (
              <DropdownItem
                key={key}
                selected={key === sort}
                onSelect={() => setSort(key)}
              >
                {t(`sort.${key}`)}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      </div>

      <div className="text-[14px] font-semibold text-muted-foreground">
        {t('found', { count: visible.length })}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-border/60 bg-surface p-6">
          <p className="text-muted-foreground">{t('noResults')}</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:text-teal-deep"
          >
            <X size={15} strokeWidth={2.2} />
            {t('resetSearch')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((a) => (
            <AgentRow key={a.id} agent={a} />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={isFetching}
          className="self-center rounded-pill border-[1.5px] border-border px-5 py-2 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {isFetching ? t('loadingMore') : t('showMore')}
        </button>
      )}
    </div>
  );
}
