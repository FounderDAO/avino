/**
 * SortControl — выпадающий <select> сортировки в шапке результатов поиска.
 *
 * Zillow-стиль (Task 9): контрол живёт рядом со счётчиком результатов,
 * а не в FilterBar. Пишет URL-параметр «sort» через router.replace (scroll:false),
 * повторяя паттерн setParams из FilterBar.
 */
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { SortOption } from '@/lib/mock/types';

const SORT_OPTIONS: SortOption[] = [
  'promotion',
  'price_asc',
  'price_desc',
  'area_desc',
  'date_desc',
];

export function SortControl() {
  const t = useTranslations('search.filters');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSort = (searchParams.get('sort') ?? 'promotion') as SortOption;

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value;
      const params = new URLSearchParams(searchParams.toString());
      if (next && next !== 'promotion') {
        params.set('sort', next);
      } else {
        // Значение по умолчанию — убираем из URL
        params.delete('sort');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <select
      value={currentSort}
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
