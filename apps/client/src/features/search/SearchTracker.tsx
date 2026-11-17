/**
 * SearchTracker — событие `search` в GTM при каждой смене фильтров выдачи.
 * Фильтры живут в URL (FilterBar → router.replace), поэтому ключ события —
 * строка запроса без параметров вида (карта/список, сортировка) и границ карты:
 * сдвиг карты или смена сортировки новым поиском не считаются.
 */
'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { track } from '@/lib/analytics';

const IGNORED = new Set(['view', 'sort', 'sw_lat', 'sw_lng', 'ne_lat', 'ne_lng']);

export interface SearchTrackerProps {
  dealType: string;
  /** Код региона (slug справочника) или 'all'. */
  city: string | null;
  district: string | null;
  priceMin: number | null;
  priceMax: number | null;
}

export function SearchTracker(props: SearchTrackerProps) {
  const sp = useSearchParams();
  const key = React.useMemo(() => {
    const entries = [...sp.entries()]
      .filter(([k]) => !IGNORED.has(k))
      .sort(([a], [b]) => a.localeCompare(b));
    return new URLSearchParams(entries).toString();
  }, [sp]);

  // Свежие значения без перезапуска эффекта на каждый рендер.
  const latest = React.useRef(props);
  latest.current = props;

  React.useEffect(() => {
    const p = latest.current;
    track({
      event: 'search',
      deal_type: p.dealType,
      city: p.city,
      district: p.district,
      price_min: p.priceMin,
      price_max: p.priceMax,
    });
  }, [key]);

  return null;
}
