/**
 * MapSearch — интерактивный поиск по карте (/map, TASK-152).
 *
 * Клиентский контроллер: владеет динамической выдачей карты через RTK Query
 * `searchByBounds` (CLAUDE.md §4) и связывает список ↔ карту:
 *  - сдвиг/зум карты (без активной территории) → подгрузка листингов видимой
 *    области (MapView дебаунсит `onBoundsChange`);
 *  - режим рисования территории → клики-вершины, «Готово» замыкает полигон,
 *    запрашиваем bbox территории и отсекаем точную форму на клиенте
 *    (point-in-polygon, lib/geo) — MVP поверх /search/bounds; серверный
 *    ST_Within(polygon) — отдельная задача apps/api;
 *  - наведение на карточку → панорам/подсветка пина; клик по пину → превью
 *    карточки (PropertyCard) и выбор в списке.
 *
 * Пины брендовые (ADR-0060) задаёт MapView. Только apps/client.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Pencil, Check, X, Trash2 } from 'lucide-react';
import { PropertyCard } from '@/features/search/PropertyCard';
import { cn } from '@/lib/utils';
import {
  polygonBounds,
  pointInPolygon,
  isValidBounds,
  type LatLng,
  type LatLngBounds,
} from '@/lib/geo';
import { useLazySearchByBoundsQuery } from '@/store/api/searchApi';
import type { Listing, ListingFilter, TransactionType } from '@/lib/mock/types';

// Карта — только на клиенте (Yandex JS API требует window).
const MapView = dynamic(() => import('@/features/map/MapView').then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#e8ede9]" />,
});

export interface MapSearchProps {
  /** Стартовая выдача (SSR, общий промо-приоритет) — до первого bounds-запроса. */
  initialListings: Listing[];
  locale: string;
  /**
   * Тип сделки из URL (?tx=), резолвится на сервере (page.tsx). НЕ читаем через
   * useSearchParams здесь: это де-оптимизировало бы всю страницу /map в CSR
   * (пустой SSR-шелл вместо стартовой выдачи).
   */
  tx?: TransactionType;
}

export function MapSearch({ initialListings, locale, tx }: MapSearchProps) {
  const t = useTranslations('search');
  const filter: ListingFilter = React.useMemo(() => (tx ? { tx } : {}), [tx]);

  const [raw, setRaw] = React.useState<Listing[]>(initialListings);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [drawing, setDrawing] = React.useState(false);
  const [polygon, setPolygon] = React.useState<LatLng[] | null>(null);
  const [finishSignal, setFinishSignal] = React.useState(0);
  const [vertices, setVertices] = React.useState(0);
  const [mobView, setMobView] = React.useState<'list' | 'map'>('list');

  const [trigger, { isFetching }] = useLazySearchByBoundsQuery();

  const runBounds = React.useCallback(
    (bounds: LatLngBounds) => {
      if (!isValidBounds(bounds)) return;
      trigger({ bounds, filter, limit: 100 })
        .unwrap()
        .then(setRaw)
        .catch(() => {
          /* сеть/5xx — оставляем прежнюю выдачу */
        });
    },
    [trigger, filter],
  );

  // Видимая область (без активной территории) → подгрузка листингов.
  const handleBoundsChange = React.useCallback(
    (b: LatLngBounds) => {
      if (polygon) return;
      runBounds(b);
    },
    [polygon, runBounds],
  );

  // Территория замкнута: bbox → запрос, точную форму отсечём на клиенте.
  const handlePolygonComplete = React.useCallback(
    (pts: LatLng[]) => {
      setDrawing(false);
      setPolygon(pts);
      const bbox = polygonBounds(pts);
      if (bbox) runBounds(bbox);
    },
    [runBounds],
  );

  // Внутри территории — фильтр point-in-polygon; иначе вся выдача области.
  const displayed = React.useMemo(() => {
    if (!polygon) return raw;
    return raw.filter((l) => l.lat != null && l.lng != null && pointInPolygon(l.lat, l.lng, polygon));
  }, [raw, polygon]);

  const startDraw = () => {
    setPolygon(null);
    setVertices(0);
    setPreviewId(null);
    setDrawing(true);
  };
  const cancelDraw = () => {
    setDrawing(false);
    setVertices(0);
  };
  const clearTerritory = () => {
    setPolygon(null);
    setVertices(0);
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
    setPreviewId(id);
  };

  const preview = previewId ? displayed.find((l) => l.id === previewId) ?? raw.find((l) => l.id === previewId) : null;
  const total = displayed.length;

  return (
    <div className="relative flex h-[calc(100dvh-var(--header-h)-1px)] min-h-[480px]">
      {/* ---- Список (свой скролл) ---- */}
      <div
        className={cn(
          'min-w-0 overflow-y-auto',
          'w-full lg:w-[42%] lg:max-w-[42%]',
          mobView === 'map' && 'hidden lg:block',
        )}
      >
        <div className="px-5 pb-3 pt-[18px]">
          <h1 className="text-2xl">{t('map.heading')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isFetching
              ? t('map.loading')
              : polygon
                ? t('map.areaCount', { count: total })
                : t('results.count', { count: total })}
          </p>
        </div>

        {total === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">{t('map.emptyArea')}</p>
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

      {/* ---- Карта ---- */}
      <div
        className={cn(
          'relative h-full',
          'lg:w-[58%] lg:flex-1',
          mobView === 'list' ? 'hidden lg:block' : 'absolute inset-0 z-[1] lg:static',
        )}
      >
        <MapView
          listings={displayed}
          activeId={activeId}
          onSelect={handleSelect}
          onHover={setActiveId}
          locale={locale}
          polygon={polygon}
          drawMode={drawing ? 'polygon' : null}
          finishSignal={finishSignal}
          onPolygonComplete={handlePolygonComplete}
          onPolygonProgress={setVertices}
          onBoundsChange={handleBoundsChange}
          autoFit={false}
        />

        {/* ---- Управление территорией (поверх карты) ---- */}
        <div className="absolute right-3 top-3 z-[1000] flex flex-wrap items-center justify-end gap-2">
          {drawing ? (
            <>
              <span className="rounded-pill bg-ink/85 px-3.5 py-2 text-[13px] font-semibold text-white shadow-raised">
                {t('map.drawHint', { count: vertices })}
              </span>
              <button
                type="button"
                onClick={() => setFinishSignal((s) => s + 1)}
                disabled={vertices < 3}
                className="inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-ink bg-ink px-4 py-2 text-sm font-bold text-white shadow-raised transition-colors disabled:opacity-50"
              >
                <Check size={15} strokeWidth={2.2} />
                {t('map.finish')}
              </button>
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

        {/* ---- Превью карточки по клику на пин ---- */}
        {preview && (
          <div className="absolute bottom-4 left-3 right-3 z-[1000] mx-auto max-w-sm sm:left-4 sm:right-auto">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                aria-label={t('map.preview.close')}
                className="absolute -right-2 -top-2 z-[1] grid h-7 w-7 place-items-center rounded-full bg-ink text-white shadow-raised"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
              <PropertyCard listing={preview} className="bg-surface shadow-raised" />
            </div>
          </div>
        )}
      </div>

      {/* ---- Мобильный переключатель Список / Карта ---- */}
      <button
        type="button"
        onClick={() => setMobView((v) => (v === 'list' ? 'map' : 'list'))}
        className="fixed bottom-[22px] left-1/2 z-[25] -translate-x-1/2 rounded-pill bg-ink px-[22px] py-[13px] text-[15px] font-bold text-white shadow-raised lg:hidden"
      >
        {mobView === 'list' ? t('results.map') : t('results.list')}
      </button>
    </div>
  );
}
