/**
 * SavedSearches — вкладка «Сохранённые поиски» (auth-aware, серверная).
 *
 * - Авторизован: список из GET /saved-searches (useGetSavedSearchesQuery).
 *   Тумблер «колокольчик» отражает is_active и шлёт PATCH; крестик — DELETE;
 *   ссылка элемента ведёт в выдачу через filtersToSearchHref.
 * - Гость: серверный эндпоинт защищён (401) → подсказка войти (вход —
 *   модалка в Header, отдельного /login-маршрута нет).
 */
'use client';

import * as React from 'react';
import { Link } from '@/i18n/navigation';
import { Bell, BookmarkX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import {
  useGetSavedSearchesQuery,
  useUpdateSavedSearchMutation,
  useDeleteSavedSearchMutation,
  type SavedSearch,
} from '@/store/api/savedSearchesApi';
import { describeFilters, filtersToSearchHref } from '@/lib/savedSearch';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function SavedSearches() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const {
    data: items,
    isLoading,
    isError,
  } = useGetSavedSearchesQuery(undefined, { skip: !isAuthenticated });

  return (
    <div>
      <h1 className="mb-[18px] text-[28px]">Сохранённые поиски</h1>

      {!isAuthenticated ? (
        <EmptyState
          icon={BookmarkX}
          title="Войдите, чтобы сохранять поиски"
          text="Сохраняйте наборы фильтров и получайте уведомления о новых объявлениях — после входа они появятся здесь."
          action={
            <Button asChild>
              {/* Вход — модалка в Header; /login-маршрута нет. TODO(account-auth-guard). */}
              <Link href="/">На главную</Link>
            </Button>
          }
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[78px]" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={BookmarkX}
          title="Не удалось загрузить сохранённые поиски"
          text="Попробуйте обновить страницу чуть позже."
        />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={BookmarkX}
          title="Здесь пока пусто"
          text="Настройте фильтры в поиске и нажмите «Сохранить поиск», чтобы вернуться к ним позже."
          action={
            <Button asChild>
              <Link href="/search">Начать поиск</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((s) => (
            <SavedSearchRow key={s.id} item={s} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Одна строка списка — изолирует per-item pending-состояния мутаций. */
function SavedSearchRow({ item }: { item: SavedSearch }) {
  const [updateSearch, { isLoading: isUpdating }] = useUpdateSavedSearchMutation();
  const [deleteSearch, { isLoading: isDeleting }] = useDeleteSavedSearchMutation();

  const meta = describeFilters(item.filters_json.filters);
  const href = filtersToSearchHref(item.filters_json.filters);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3.5 rounded-card border border-border/60 bg-surface px-[18px] py-4 shadow-card">
      <Link href={href} className="min-w-0">
        <div className="text-base font-bold">{item.name}</div>
        {/* TODO(saved-search-count): бэк не возвращает кол-во объявлений. */}
        {meta && (
          <div className="mt-[3px] text-[13.5px] text-muted-foreground">{meta}</div>
        )}
      </Link>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isUpdating}
          onClick={() =>
            updateSearch({ id: item.id, is_active: !item.is_active })
          }
          className={cn(
            'flex items-center gap-2 text-[13.5px] font-bold disabled:opacity-50',
            item.is_active ? 'text-teal' : 'text-muted-foreground',
          )}
        >
          <Bell size={17} fill={item.is_active ? 'currentColor' : 'none'} />
          {item.is_active ? 'Уведомления вкл.' : 'Уведомления выкл.'}
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => deleteSearch(item.id)}
          aria-label="Удалить поиск"
          className="p-1 text-muted-foreground hover:text-ink disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
