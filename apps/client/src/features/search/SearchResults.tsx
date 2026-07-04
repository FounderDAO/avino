/**
 * SearchResults — тело выдачи /search (Купить/Аренда): сплит «карта + список».
 *
 * Десктоп (≥1000px): СЛЕВА карта (50%), СПРАВА колонка-список (50%) со своим
 * вертикальным скроллом. Мобайл (<1000px): показывается ЛИБО карта, ЛИБО список;
 * плавающая кнопка-тогл «Карта»/«Список». По умолчанию список; ?view=map → карта.
 *
 * Карта поддерживает «Нарисовать территорию» (freehand-лассо, как на /map):
 * обводка → GET /search/polygon (ST_Within на сервере, RTK Query), с учётом
 * текущих фильтров. Без территории показывается SSR-выдача по фильтрам (props).
 * Радиусный поиск убран (ADR-0070/0071).
 */
'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { skipToken } from '@reduxjs/toolkit/query';
import { Link } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { List as ListIcon, Map as MapIcon, Pencil, Trash2, X } from 'lucide-react';
import { PropertyCard } from '@/features/search/PropertyCard';
import { PropertyCardSkeleton } from '@/features/search/PropertyCardSkeleton';
import { SortControl } from '@/features/search/SortControl';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { serializePolygonRing, type LatLng, type LatLngBounds } from '@/lib/geo';
import {
  useSearchByPolygonQuery,
  useLazySearchPageQuery,
} from '@/store/api/searchApi';
import type { Listing, ListingFilter } from '@/lib/mock/types';
import { useCurrencyPreference } from '@/lib/useCurrencyPreference';
import { useMapHoverRecenter } from '@/lib/useMapHoverRecenter';
import { MapPreviewCard } from '@/features/map/MapPreviewCard';
import { useViewportSearch } from '@/features/map/useViewportSearch';
import { useAppDispatch } from '@/store/hooks';
import {
  setTerritory,
  clearTerritory as clearTerritoryRedux,
} from '@/store/territorySlice';

// Карта — только на клиенте (Yandex JS API требует window). next/dynamic ssr:false.
const MapView = dynamic(
  () => import('@/features/map/MapView').then((m) => m.MapView),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[#e8ede9]" />,
  },
);

export interface SearchResultsProps {
  /** Первая страница выдачи из SSR (limit=24). */
  listings: Listing[];
  /** meta.total — общее число объявлений под фильтром (для счётчика). */
  total: number;
  /** meta.next_cursor первой страницы — старт keyset-дозагрузки (null = одна страница). */
  initialCursor: string | null;
  /** Вид по умолчанию (из ?view): на десктопе всегда сплит, влияет на мобайл. */
  view: 'list' | 'map';
  /** Заголовок выдачи (например «Покупка жилья · Ташкент»). */
  heading: string;
  /** Текущие фильтры из URL — применяются к поиску по нарисованной территории. */
  filter: ListingFilter;
  /** Состояние загрузки (скелетоны). */
  loading?: boolean;
  /** SSR-восстановленная область карты (?sw_lat=…) — стартуем в viewport-режиме. */
  initialBounds?: LatLngBounds | null;
}

export function SearchResults({
  listings,
  total: totalAll,
  initialCursor,
  view,
  heading,
  filter,
  loading,
  initialBounds = null,
}: SearchResultsProps) {
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const recenterOnHover = useMapHoverRecenter();

  // Предпочтение валюты из Redux (Task 14): добавляем в RTK-запросы (polygon/keyset),
  // чтобы бэкенд фильтровал price_min/price_max в правильной валюте.
  const displayCurrency = useCurrencyPreference();
  const filterWithCurrency = React.useMemo<ListingFilter>(
    () => ({ ...filter, currency: displayCurrency }),
    [filter, displayCurrency],
  );
  // Режим рисования территории + нарисованное кольцо (как на /map).
  const [drawing, setDrawing] = React.useState(false);
  const [polygon, setPolygon] = React.useState<LatLng[] | null>(null);
  // Мобильный вид: список или карта (по умолчанию — из URL).
  const [mobView, setMobView] = React.useState<'list' | 'map'>(view);
  React.useEffect(() => setMobView(view), [view]);

  // Сериализованное кольцо — стабильный ключ кэша RTK Query.
  const points = React.useMemo(
    () => (polygon ? serializePolygonRing(polygon) : null),
    [polygon],
  );

  // ── Viewport-режим (Zillow): список = видимая область карты ──
  // Активен только без явного гео-фильтра и территории; активация — жестом
  // пользователя на карте (или сразу, если SSR восстановил bbox из URL).
  const geoFilterActive = Boolean(filter.districtId || filter.regionId);
  const vp = useViewportSearch({
    mode: 'gesture',
    filter: filterWithCurrency,
    geoFilterActive,
    polygonActive: Boolean(points),
    syncUrl: true,
    initialBounds,
  });

  // Зеркалим нарисованное кольцо в Redux, чтобы кнопка «Сохранить поиск» в FilterBar
  // (соседний компонент) могла положить territory в сохранённый поиск.
  const dispatch = useAppDispatch();
  React.useEffect(() => {
    dispatch(setTerritory(points));
  }, [points, dispatch]);
  // Уходим со страницы поиска — сбрасываем, чтобы не утащить чужую территорию.
  React.useEffect(() => () => void dispatch(clearTerritoryRedux()), [dispatch]);

  // Поиск по территории (ST_Within на сервере). Без территории — skip, показываем
  // SSR-выдачу по фильтрам. Смена фильтров при активной территории автоматически
  // рефетчит (ключ кэша = points + filterWithCurrency).
  const { data: polygonData, isFetching } = useSearchByPolygonQuery(
    points ? { points, filter: filterWithCurrency, limit: 100 } : skipToken,
  );

  // ── Пагинация по keyset-курсору (TASK-199) ──
  // SSR отдаёт первую страницу (limit=24) + курсор; докуданные страницы храним
  // отдельно и дотягиваем по кнопке «Показать ещё» через RTK Query (CLAUDE.md §4).
  // Сбрасываем при смене фильтров: и сигнатура фильтра, и первый курсор приходят
  // новой SSR-выдачей одновременно.
  const filterKey = React.useMemo(() => JSON.stringify(filterWithCurrency), [filterWithCurrency]);
  const [extra, setExtra] = React.useState<Listing[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(initialCursor);
  React.useEffect(() => {
    setExtra([]);
    setCursor(initialCursor);
  }, [filterKey, initialCursor]);

  const [loadPage, { isFetching: loadingMore }] = useLazySearchPageQuery();
  const loadMore = React.useCallback(async () => {
    if (!cursor || loadingMore) return;
    try {
      const res = await loadPage({ cursor, filter: filterWithCurrency, limit: 24 }).unwrap();
      // Append: набор листингов растёт → MapView перестраивает пины, а подсветка
      // activeId живёт отдельным эффектом, поэтому активный hover не сбрасывается.
      setExtra((prev) => [...prev, ...res.listings]);
      setCursor(res.nextCursor);
    } catch {
      // Сеть/5xx — курсор не двигаем, пользователь может повторить.
    }
  }, [cursor, loadingMore, loadPage, filterWithCurrency]);

  // Выдача по фильтрам = SSR-страница + докуданные; по территории — полигон;
  // в viewport-режиме — bounds-выдача (до первого ответа — SSR-страница:
  // при SSR-восстановлении bbox она уже посчитана по bounds).
  const paged = React.useMemo(() => [...listings, ...extra], [listings, extra]);
  const displayed = points
    ? polygonData ?? []
    : vp.active
      ? vp.listings ?? paged
      : paged;

  // Viewport-режим: один запрос (limit=100), список раскрывается локальными
  // батчами по 24 без сети (маркеры при этом видят весь набор).
  const [visibleCount, setVisibleCount] = React.useState(24);
  React.useEffect(() => {
    setVisibleCount(24);
  }, [vp.listings]);
  const listShown = vp.active && !points ? displayed.slice(0, visibleCount) : displayed;

  const shownCount = listShown.length;
  const totalCount = points || vp.active ? displayed.length : totalAll;
  const hasMore = points
    ? false
    : vp.active
      ? visibleCount < displayed.length
      : cursor != null;
  const busy = Boolean(loading) || isFetching;
  const onShowMore = vp.active
    ? () => setVisibleCount((c) => c + 24)
    : loadMore;

  const startDraw = () => {
    setPolygon(null);
    vp.closePreview();
    setDrawing(true);
  };
  const cancelDraw = () => setDrawing(false);
  const clearTerritory = () => {
    setPolygon(null);
    // сброс территории → рефетч последней области (симметрия с /map)
    vp.refetchLastBounds();
  };
  const handlePolygonComplete = React.useCallback((pts: LatLng[]) => {
    setDrawing(false);
    // Невалидное кольцо (< 3 вершин / вне WGS84) → территорию не ставим.
    setPolygon(serializePolygonRing(pts) ? pts : null);
  }, []);

  return (
    // Рабочая область сплита занимает высоту вьюпорта под хедером и фильтр-баром.
    <div className="relative flex h-[calc(100dvh-var(--header-h)-61px)] min-h-[480px]">
      {/* ---- Карта (слева) ---- */}
      <div
        className={cn(
          'relative h-full',
          // Десктоп: 60% (карта шире списка, как у Zillow). Мобайл: на весь экран,
          // скрыта когда показан список.
          'lg:w-3/5',
          mobView === 'list'
            ? 'hidden lg:block'
            : 'absolute inset-0 z-[1] lg:static',
        )}
      >
        <MapView
          listings={displayed}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            vp.openPreview(id);
          }}
          onHover={setActiveId}
          locale={locale}
          polygon={polygon}
          drawMode={drawing ? 'polygon' : null}
          onPolygonComplete={handlePolygonComplete}
          onBoundsChange={vp.handleBoundsChange}
          initialBounds={initialBounds}
          autoFit={!vp.active}
          recenterOnHover={recenterOnHover}
        />

        {/* ---- Управление территорией (поверх карты, как на /map) ---- */}
        <div className="absolute right-3 top-3 z-[1000] flex flex-wrap items-center justify-end gap-2">
          {drawing ? (
            <>
              <span className="rounded-pill bg-ink/85 px-3.5 py-2 text-[13px] font-semibold text-white shadow-raised">
                {t('map.drawHint')}
              </span>
              <button
                type="button"
                onClick={cancelDraw}
                className="inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-border bg-surface px-4 py-2 text-sm font-bold text-ink shadow-raised transition-colors hover:border-ink"
              >
                <X size={15} strokeWidth={2.2} />
                {t('map.cancel')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startDraw}
                className="inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-border bg-surface px-4 py-2 text-sm font-bold text-ink shadow-raised transition-colors hover:border-ink"
              >
                <Pencil size={15} strokeWidth={2.2} />
                {t('map.drawTerritory')}
              </button>
              {polygon && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-ink px-3.5 py-2 text-sm font-bold text-white shadow-raised">
                  {t('map.areaCount', { count: shownCount })}
                  <button
                    type="button"
                    onClick={clearTerritory}
                    aria-label={t('map.clear')}
                    className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-white/20"
                  >
                    <Trash2 size={14} strokeWidth={2.2} />
                  </button>
                </span>
              )}
            </>
          )}
        </div>

        {/* ---- Превью карточки по клику на пин (Zillow) ---- */}
        {(() => {
          const preview = vp.previewId
            ? displayed.find((l) => l.id === vp.previewId) ?? null
            : null;
          return preview ? (
            <MapPreviewCard listing={preview} onClose={vp.closePreview} />
          ) : null;
        })()}
      </div>

      {/* ---- Колонка со списком (справа, свой скролл) ---- */}
      <div
        className={cn(
          'min-w-0 overflow-y-auto',
          // Десктоп: 40% (уже карты → карточки уже и ниже, видно больше). Мобайл:
          // вся ширина, скрыт когда показана карта.
          'w-full lg:w-2/5 lg:max-w-[40%]',
          mobView === 'map' && 'hidden lg:block',
        )}
      >
        {/* Заголовок + счётчик + сортировка (Zillow-стиль, Task 9) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-3 pt-[18px]">
          <div>
            <h1 className="text-2xl">{heading}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {busy
                ? tCommon('loading')
                : polygon
                  ? t('map.areaCount', { count: shownCount })
                  : vp.active && vp.isFetching
                    ? tCommon('loading')
                    : t('results.count', { count: totalCount })}
            </p>
          </div>
          {/* Сортировка рядом со счётчиком (Zillow-стиль); применяется и под территорией */}
          <SortControl />
        </div>

        {busy ? (
          <div className="grid grid-cols-1 gap-4 px-4 pb-6 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : shownCount === 0 ? (
          polygon ? (
            <EmptyState
              title={t('map.emptyArea')}
              action={
                <Button variant="outline" onClick={clearTerritory}>
                  {t('map.clear')}
                </Button>
              }
            />
          ) : vp.active ? (
            <EmptyState title={t('map.emptyArea')} />
          ) : (
            <EmptyState
              title={t('results.emptyTitle')}
              text={t('results.emptyText')}
              action={
                <Button asChild variant="outline">
                  <Link href="/search">{t('results.resetFilters')}</Link>
                </Button>
              }
            />
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 px-4 pb-5 sm:grid-cols-2">
            {listShown.map((l) => (
              <div
                key={l.id}
                onMouseEnter={() => setActiveId(l.id)}
                onMouseLeave={() => setActiveId(null)}
                className={cn(
                  'rounded-card transition-[outline] duration-150',
                  activeId === l.id
                    ? 'outline outline-2 outline-red'
                    : 'outline outline-2 outline-transparent',
                )}
              >
                <PropertyCard listing={l} />
              </div>
            ))}
          </div>
        )}

        {/* ---- «Показать ещё» (keyset-пагинация, TASK-199) ---- */}
        {!busy && shownCount > 0 && hasMore && (
          <div className="flex flex-col items-center gap-2 px-5 pb-8">
            <Button
              variant="outline"
              onClick={onShowMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
            >
              {loadingMore ? tCommon('loading') : t('results.showMore')}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t('results.shownOfTotal', { shown: shownCount, total: totalCount })}
            </p>
          </div>
        )}
      </div>

      {/* ---- Мобильный переключатель Список / Карта ---- */}
      <button
        type="button"
        onClick={() => setMobView((v) => (v === 'list' ? 'map' : 'list'))}
        className="fixed bottom-[22px] left-1/2 z-[25] flex -translate-x-1/2 items-center gap-2 rounded-pill bg-ink px-[22px] py-[13px] text-[15px] font-bold text-white shadow-raised lg:hidden"
      >
        {mobView === 'list' ? (
          <>
            <MapIcon size={18} /> {t('results.map')}
          </>
        ) : (
          <>
            <ListIcon size={18} /> {t('results.list')}
          </>
        )}
      </button>
    </div>
  );
}
