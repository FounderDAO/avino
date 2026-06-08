'use client';

import { Button } from '@/components/ui/button';
import type { ListingCard, SearchSort } from '@/store/api/searchApi';
import { PropertyCard } from './PropertyCard';
import { SORT_LABELS } from './format';

/**
 * Сетка результатов поиска + сортировка + keyset-пагинация (TASK-151).
 * Сортировка по умолчанию — `promotion_priority_desc` (VIP > TOP > NORMAL).
 */

const SORT_OPTIONS: SearchSort[] = [
  'promotion_priority_desc',
  'date_desc',
  'price_asc',
  'price_desc',
  'area_asc',
  'area_desc',
];

interface SearchResultsProps {
  listings: ListingCard[];
  total?: number;
  sort: SearchSort;
  onSortChange: (sort: SearchSort) => void;
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  onLoadMore: () => void;
}

export function SearchResults({
  listings,
  total,
  sort,
  onSortChange,
  hasMore,
  isLoading,
  isFetchingMore,
  isError,
  onLoadMore,
}: SearchResultsProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {typeof total === 'number'
            ? `Найдено: ${total}`
            : `Показано: ${listings.length}`}
        </p>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Сортировка
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SearchSort)}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isError ? (
        <p className="rounded-xl border border-destructive/40 bg-card p-8 text-center text-sm text-destructive">
          Не удалось загрузить объявления. Попробуйте ещё раз.
        </p>
      ) : isLoading ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Загрузка…
        </p>
      ) : listings.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          По заданным фильтрам ничего не найдено.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <PropertyCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {hasMore && !isError && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isFetchingMore}
          >
            {isFetchingMore ? 'Загрузка…' : 'Показать ещё'}
          </Button>
        </div>
      )}
    </section>
  );
}
