/**
 * useViewportSearch — «список = видимая область карты» (Zillow-режим).
 *
 * Общий контроллер для /search (mode='gesture': активация первым жестом
 * пользователя) и /map (mode='always': любой bounds грузит выдачу, включая
 * стартовый эмит MapView). Гео-приоритет как у Zillow:
 *   полигон-территория > явный гео-фильтр (район/регион) > viewport.
 * Пока полигон или гео-фильтр активны — движение карты выдачу НЕ меняет.
 *
 * При syncUrl bbox зеркалится в URL shallow-обновлением history.replaceState
 * (НЕ router.replace — тот дёргает серверный ре-рендер RSC на каждый пан);
 * SSR /search читает эти параметры и восстанавливает область (initialBounds).
 * Смена не-гео фильтров при активном режиме перезапрашивает последнюю область
 * клиентски (FilterBar пересобирает URL без bbox — режим живёт в состоянии).
 */
'use client';

import * as React from 'react';
import {
  isValidBounds,
  setBoundsParams,
  BBOX_PARAM_KEYS,
  type LatLngBounds,
} from '@/lib/geo';
import { useLazySearchByBoundsQuery } from '@/store/api/searchApi';
import type { Listing, ListingFilter } from '@/lib/mock/types';

export interface ViewportSearchOptions {
  /** 'always' — /map: любой bounds грузит выдачу; 'gesture' — /search:
   *  активация только жестом пользователя (meta.user из MapView). */
  mode: 'always' | 'gesture';
  /** Не-гео фильтры §9 — прокидываются в /search/bounds. */
  filter: ListingFilter;
  /** Явный гео-фильтр (район/регион) активен → viewport глушится (Zillow). */
  geoFilterActive?: boolean;
  /** Территория активна → bounds-запросы глушатся (полигон приоритетнее). */
  polygonActive?: boolean;
  /** Зеркалить bbox в URL (history.replaceState). Только /search. */
  syncUrl?: boolean;
  /** SSR-восстановленная область (?sw_lat=…) — режим активен со старта. */
  initialBounds?: LatLngBounds | null;
}

export interface ViewportSearch {
  /** Активен ли viewport-режим (для 'always' — всегда true). */
  active: boolean;
  /** Выдача последнего bounds-запроса; null — запросов ещё не было. */
  listings: Listing[] | null;
  isFetching: boolean;
  /** Колбэк для MapView.onBoundsChange. */
  handleBoundsChange: (b: LatLngBounds, meta?: { user: boolean }) => void;
  /** Повторить запрос по последней области (сброс территории на /map). */
  refetchLastBounds: () => void;
  /** Превью пина (клик по маркеру). */
  previewId: string | null;
  openPreview: (id: string) => void;
  closePreview: () => void;
}

/** Убирает bbox-параметры из текущего URL (shallow). */
function clearBboxFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!BBOX_PARAM_KEYS.some((k) => url.searchParams.has(k))) return;
  for (const k of BBOX_PARAM_KEYS) url.searchParams.delete(k);
  window.history.replaceState(window.history.state, '', url);
}

export function useViewportSearch({
  mode,
  filter,
  geoFilterActive = false,
  polygonActive = false,
  syncUrl = false,
  initialBounds = null,
}: ViewportSearchOptions): ViewportSearch {
  const [active, setActive] = React.useState(
    mode === 'always' || Boolean(initialBounds),
  );
  const [listings, setListings] = React.useState<Listing[] | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [trigger, { isFetching }] = useLazySearchByBoundsQuery();

  const lastBoundsRef = React.useRef<LatLngBounds | null>(initialBounds);
  // Свежий фильтр в ref: runBounds стабилен, эффект смены фильтра — отдельный.
  const filterRef = React.useRef(filter);
  filterRef.current = filter;
  const filterKey = JSON.stringify(filter);

  const runBounds = React.useCallback(
    (b: LatLngBounds) => {
      if (!isValidBounds(b)) return;
      trigger({ bounds: b, filter: filterRef.current, limit: 100 })
        .unwrap()
        .then((res) => {
          // Защита от гонки: свежее панорамирование инвалидирует ответ старого
          // запроса — если это уже не последняя область, ответ устарел.
          if (lastBoundsRef.current !== b) return;
          setListings(res);
          if (syncUrl && typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            setBoundsParams(url.searchParams, b);
            window.history.replaceState(window.history.state, '', url);
          }
        })
        .catch(() => {
          /* сеть/5xx — оставляем прежнюю выдачу (toast покажет мидлварь) */
        });
    },
    [trigger, syncUrl],
  );

  const handleBoundsChange = React.useCallback(
    (b: LatLngBounds, meta?: { user: boolean }) => {
      lastBoundsRef.current = b; // помним область даже под полигоном/фильтром
      if (polygonActive || geoFilterActive) return;
      if (mode === 'gesture' && !active && !meta?.user) return;
      if (!active) setActive(true);
      runBounds(b);
    },
    [polygonActive, geoFilterActive, mode, active, runBounds],
  );

  const refetchLastBounds = React.useCallback(() => {
    if (lastBoundsRef.current) runBounds(lastBoundsRef.current);
  }, [runBounds]);

  // Появился явный гео-фильтр → выходим из viewport-режима (Zillow: boundary
  // главнее) и чистим bbox из URL.
  React.useEffect(() => {
    if (mode !== 'gesture' || !geoFilterActive) return;
    setActive(false);
    setListings(null);
    if (syncUrl) clearBboxFromUrl();
  }, [geoFilterActive, mode, syncUrl]);

  // Смена не-гео фильтров при активном режиме → перезапрос последней области.
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (active && !polygonActive && !geoFilterActive && lastBoundsRef.current) {
      runBounds(lastBoundsRef.current);
    }
    // Только filterKey: остальное — снимок условий на момент смены фильтра.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const openPreview = React.useCallback((id: string) => setPreviewId(id), []);
  const closePreview = React.useCallback(() => setPreviewId(null), []);

  return {
    active,
    listings,
    isFetching,
    handleBoundsChange,
    refetchLastBounds,
    previewId,
    openPreview,
    closePreview,
  };
}
