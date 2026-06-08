'use client';

import { useMemo, useState } from 'react';
import { Currency, DealType } from '@avino/shared';
import {
  DEFAULT_SORT,
  SEARCH_PAGE_SIZE,
  useSearchListingsQuery,
} from '@/store/api/searchApi';
import type { SearchSort } from '@/store/api/searchApi';
import { FilterBar } from './FilterBar';
import type { FilterBarValue } from './FilterBar';
import { SearchResults } from './SearchResults';
import { DEAL_TYPE_LABELS } from './format';

/**
 * Страница поиска объявлений (TASK-151).
 *
 * Владеет применёнными фильтрами, сортировкой и keyset-курсором. При любой
 * смене фильтров/сортировки курсор сбрасывается (новый кэш RTK Query),
 * «Показать ещё» двигает курсор на `meta.next_cursor` — searchApi накапливает
 * страницы через `merge`.
 *
 * `transactionType` фиксируется страницей: `/sale` → SALE, `/rent` → RENT.
 */
export function SearchPage({ transactionType }: { transactionType: DealType }) {
  const [filters, setFilters] = useState<FilterBarValue>({
    currency: Currency.UZS,
  });
  const [sort, setSort] = useState<SearchSort>(DEFAULT_SORT);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const queryArg = useMemo(
    () => ({
      ...filters,
      transaction_type: transactionType,
      sort,
      limit: SEARCH_PAGE_SIZE,
      cursor,
    }),
    [filters, transactionType, sort, cursor],
  );

  const { data, isLoading, isFetching, isError } =
    useSearchListingsQuery(queryArg);

  const listings = data?.data ?? [];
  const nextCursor = data?.meta.next_cursor ?? null;
  // Дозагрузка идёт, когда курсор задан и запрос в полёте.
  const isFetchingMore = isFetching && cursor !== undefined;

  const applyFilters = (next: FilterBarValue) => {
    setCursor(undefined);
    setFilters(next);
  };

  const changeSort = (next: SearchSort) => {
    setCursor(undefined);
    setSort(next);
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {DEAL_TYPE_LABELS[transactionType]} недвижимости
        </h1>
        <p className="text-sm text-muted-foreground">
          Актуальные объявления в Узбекистане
        </p>
      </header>

      <FilterBar value={filters} onApply={applyFilters} />

      <SearchResults
        listings={listings}
        total={data?.meta.total}
        sort={sort}
        onSortChange={changeSort}
        hasMore={Boolean(nextCursor)}
        isLoading={isLoading}
        isFetchingMore={isFetchingMore}
        isError={isError}
        onLoadMore={() => nextCursor && setCursor(nextCursor)}
      />
    </main>
  );
}
