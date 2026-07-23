/**
 * SortControl — выпадающий <select> сортировки в шапке результатов поиска.
 *
 * Сорт — чисто клиентское состояние (Redux `sortSlice`): смена НЕ ходит на сервер.
 * `SearchResults` читает сорт и переупорядочивает уже загруженный список
 * ({@link sortListings}). URL (`?sort=`) обновляется shallow-навигацией
 * (`history.replaceState`) — для шаринга и restore saved-search, но без RSC-
 * ре-рендера и без рефетча (раньше здесь был `router.replace` → фриз выдачи).
 */
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { SortOption } from '@/lib/mock/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { hydrateSort, setSort, selectSort } from '@/store/sortSlice';

const SORT_OPTIONS: SortOption[] = [
  'promotion',
  'price_asc',
  'price_desc',
  'area_desc',
  'date_desc',
];

export function SortControl() {
  const t = useTranslations('search.filters');
  const dispatch = useAppDispatch();
  const sort = useAppSelector(selectSort);
  const searchParams = useSearchParams();

  // Синхронизация Redux ← URL: на маунте (шареная ссылка / restore saved-search)
  // и после реальных навигаций FilterBar (те несут sort в URL). Наш собственный
  // shallow-replaceState useSearchParams НЕ обновляет → петли нет.
  const urlSort = (searchParams.get('sort') ?? 'promotion') as SortOption;
  React.useEffect(() => {
    dispatch(hydrateSort(urlSort));
  }, [urlSort, dispatch]);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value as SortOption;
      dispatch(setSort(next));
      // Shallow-обновление URL: для шаринга/saved-search, без навигации и рефетча.
      const params = new URLSearchParams(window.location.search);
      if (next && next !== 'promotion') {
        params.set('sort', next);
      } else {
        params.delete('sort');
      }
      const qs = params.toString();
      const url = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      window.history.replaceState(window.history.state, '', url);
    },
    [dispatch],
  );

  return (
    <select
      value={sort}
      onChange={handleChange}
      aria-label={t('sortAria')}
      className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {t(`sort.${opt}`)}
        </option>
      ))}
    </select>
  );
}
