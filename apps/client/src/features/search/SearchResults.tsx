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
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { serializePolygonRing, type LatLng } from '@/lib/geo';
import { useSearchByPolygonQuery } from '@/store/api/searchApi';
import type { Listing, ListingFilter } from '@/lib/mock/types';

// Карта — только на клиенте (Yandex JS API требует window). next/dynamic ssr:false.
const MapView = dynamic(
  () => import('@/features/map/MapView').then((m) => m.MapView),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[#e8ede9]" />,
  },
);

export interface SearchResultsProps {
  listings: Listing[];
  /** Вид по умолчанию (из ?view): на десктопе всегда сплит, влияет на мобайл. */
  view: 'list' | 'map';
  /** Заголовок выдачи (например «Покупка жилья · Ташкент»). */
  heading: string;
  /** Текущие фильтры из URL — применяются к поиску по нарисованной территории. */
  filter: ListingFilter;
  /** Состояние загрузки (скелетоны). */
  loading?: boolean;
}

export function SearchResults({ listings, view, heading, filter, loading }: SearchResultsProps) {
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [activeId, setActiveId] = React.useState<string | null>(null);
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

  // Поиск по территории (ST_Within на сервере). Без территории — skip, показываем
  // SSR-выдачу по фильтрам. Смена фильтров при активной территории автоматически
  // рефетчит (ключ кэша = points + filter).
  const { data: polygonData, isFetching } = useSearchByPolygonQuery(
    points ? { points, filter, limit: 100 } : skipToken,
  );

  const displayed = points ? polygonData ?? [] : listings;
  const total = displayed.length;
  const busy = Boolean(loading) || isFetching;

  const startDraw = () => {
    setPolygon(null);
    setDrawing(true);
  };
  const cancelDraw = () => setDrawing(false);
  const clearTerritory = () => setPolygon(null);
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
          // Десктоп: левая половина. Мобайл: на весь экран, скрыта когда показан список.
          'lg:w-1/2',
          mobView === 'list'
            ? 'hidden lg:block'
            : 'absolute inset-0 z-[1] lg:static',
        )}
      >
        <MapView
          listings={displayed}
          activeId={activeId}
          onSelect={setActiveId}
          onHover={setActiveId}
          locale={locale}
          polygon={polygon}
          drawMode={drawing ? 'polygon' : null}
          onPolygonComplete={handlePolygonComplete}
          autoFit
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
                  {t('map.areaCount', { count: total })}
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
      </div>

      {/* ---- Колонка со списком (справа, свой скролл) ---- */}
      <div
        className={cn(
          'min-w-0 overflow-y-auto',
          // Десктоп: правая половина. Мобайл: вся ширина, скрыт когда показана карта.
          'w-full lg:w-1/2 lg:max-w-[50%]',
          mobView === 'map' && 'hidden lg:block',
        )}
      >
        {/* Заголовок + счётчик */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-3 pt-[18px]">
          <div>
            <h1 className="text-2xl">{heading}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {busy
                ? tCommon('loading')
                : polygon
                  ? t('map.areaCount', { count: total })
                  : t('results.count', { count: total })}
            </p>
          </div>
        </div>

        {busy ? (
          <div className="grid grid-cols-1 gap-5 px-5 pb-6 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : total === 0 ? (
          polygon ? (
            <EmptyState
              title={t('map.emptyArea')}
              action={
                <Button variant="outline" onClick={clearTerritory}>
                  {t('map.clear')}
                </Button>
              }
            />
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
          <div className="grid grid-cols-1 gap-5 px-5 pb-8 sm:grid-cols-2">
            {displayed.map((l) => (
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
