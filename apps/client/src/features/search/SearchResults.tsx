/**
 * SearchResults — тело выдачи: сплит «список + карта» (как в прототипе).
 *
 * Перенос search-body из search.jsx. Client-компонент: владеет активным
 * листингом (связь карточка↔пин) и мобильным переключателем вида.
 *
 * Десктоп (≥1000px): слева колонка-список (≈58%) со СВОИМ вертикальным
 * скроллом, справа — карта (≈42%), занимающая высоту вьюпорта под хедером.
 * Мобайл (<1000px): показывается ЛИБО список, ЛИБО карта; плавающая
 * кнопка-тогл «Карта»/«Список». По умолчанию список; ?view=map → карта.
 *
 * Сами данные приходят уже отфильтрованными/отсортированными со страницы.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { List as ListIcon, Map as MapIcon, Target, X } from 'lucide-react';
import { PropertyCard } from '@/features/search/PropertyCard';
import { PropertyCardSkeleton } from '@/features/search/PropertyCardSkeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Listing, RadiusCircle } from '@/lib/mock/types';

// Карта — только на клиенте (Leaflet требует window). next/dynamic ssr:false.
const MapView = dynamic(
  () => import('@/features/search/MapView').then((m) => m.MapView),
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
  /** Активный круг радиусного поиска (распарсен страницей из ?clat=&clng=&radius=). */
  circle?: RadiusCircle | null;
  /** Состояние загрузки (скелетоны). */
  loading?: boolean;
}

export function SearchResults({ listings, view, heading, circle, loading }: SearchResultsProps) {
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Режим рисования радиуса на карте (зажал-потянул-отпустил).
  const [drawMode, setDrawMode] = React.useState(false);
  // Мобильный вид: список или карта (по умолчанию — из URL).
  const [mobView, setMobView] = React.useState<'list' | 'map'>(view);
  React.useEffect(() => setMobView(view), [view]);

  /** Пишет/удаляет параметры круга в URL (паттерн FilterBar: URL — источник истины). */
  const setCircleParams = React.useCallback(
    (next: RadiusCircle | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set('clat', next.lat.toFixed(5));
        params.set('clng', next.lng.toFixed(5));
        params.set('radius', String(next.radiusM));
      } else {
        params.delete('clat');
        params.delete('clng');
        params.delete('radius');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const handleDrawComplete = React.useCallback(
    (drawn: RadiusCircle) => {
      setDrawMode(false);
      setCircleParams(drawn);
    },
    [setCircleParams],
  );

  // Подпись чипа: до 1 км — метры, дальше — километры с одним знаком.
  const radiusLabel = circle
    ? circle.radiusM < 1000
      ? t('radius.chipM', { m: circle.radiusM })
      : t('radius.chipKm', { km: Math.round(circle.radiusM / 100) / 10 })
    : null;

  const total = listings.length;

  return (
    // Рабочая область сплита занимает высоту вьюпорта под хедером и фильтр-баром.
    // Футер из общего layout идёт естественно ниже (не накладывается).
    <div className="relative flex h-[calc(100dvh-var(--header-h)-61px)] min-h-[480px]">
      {/* ---- Колонка со списком (свой скролл) ---- */}
      <div
        className={cn(
          'min-w-0 overflow-y-auto',
          // Десктоп: ~58% ширины. Мобайл: вся ширина, скрыт когда показана карта.
          'w-full lg:w-[58%] lg:max-w-[58%]',
          mobView === 'map' && 'hidden lg:block',
        )}
      >
        {/* Заголовок + счётчик */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-3 pt-[18px]">
          <div>
            <h1 className="text-2xl">{heading}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading ? tCommon('loading') : t('results.count', { count: total })}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 px-5 pb-6 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState
            title={t('results.emptyTitle')}
            text={t('results.emptyText')}
            action={
              <Button asChild variant="outline">
                <Link href="/search">{t('results.resetFilters')}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 px-5 pb-8 sm:grid-cols-2">
            {listings.map((l) => (
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

      {/* ---- Колонка с картой ---- */}
      <div
        className={cn(
          'relative h-full',
          // Десктоп: оставшаяся ширина. Мобайл: на весь экран, скрыта когда показан список.
          'lg:w-[42%] lg:flex-1',
          mobView === 'list'
            ? 'hidden lg:block'
            : 'absolute inset-0 z-[1] lg:static',
        )}
      >
        <MapView
          listings={listings}
          activeId={activeId}
          onSelect={setActiveId}
          onHover={setActiveId}
          circle={circle}
          drawMode={drawMode}
          onDrawComplete={handleDrawComplete}
        />

        {/* ---- Управление радиусом (поверх карты) ---- */}
        <div className="absolute right-3 top-3 z-[1000] flex flex-wrap items-center justify-end gap-2">
          {drawMode && (
            <span className="rounded-pill bg-ink/85 px-3.5 py-2 text-[13px] font-semibold text-white shadow-raised">
              {t('radius.hint')}
            </span>
          )}
          <button
            type="button"
            onClick={() => setDrawMode((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill border-[1.5px] px-4 py-2 text-sm font-bold shadow-raised transition-colors',
              drawMode
                ? 'border-ink bg-ink text-white'
                : 'border-border bg-surface text-ink hover:border-ink',
            )}
            aria-pressed={drawMode}
          >
            <Target size={15} strokeWidth={2.2} />
            {drawMode ? t('radius.cancel') : t('radius.draw')}
          </button>
          {circle && !drawMode && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-ink px-3.5 py-2 text-sm font-bold text-white shadow-raised">
              {radiusLabel}
              <button
                type="button"
                onClick={() => setCircleParams(null)}
                aria-label={t('radius.clearAria')}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-white/20"
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </span>
          )}
        </div>
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
