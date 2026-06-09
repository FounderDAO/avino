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
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { List as ListIcon, Map as MapIcon } from 'lucide-react';
import { PropertyCard } from '@/features/search/PropertyCard';
import { PropertyCardSkeleton } from '@/features/search/PropertyCardSkeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Listing } from '@/lib/mock/types';

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
  /** Состояние загрузки (скелетоны). */
  loading?: boolean;
}

/** Русское склонение слова «объявление». */
function pluralListings(n: number): string {
  const m = n % 10;
  const h = n % 100;
  if (m === 1 && h !== 11) return 'объявление';
  if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return 'объявления';
  return 'объявлений';
}

export function SearchResults({ listings, view, heading, loading }: SearchResultsProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Мобильный вид: список или карта (по умолчанию — из URL).
  const [mobView, setMobView] = React.useState<'list' | 'map'>(view);
  React.useEffect(() => setMobView(view), [view]);

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
              {loading ? 'Загрузка…' : `${total} ${pluralListings(total)}`}
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
            title="Ничего не найдено"
            text="Попробуйте смягчить фильтры или расширить район поиска — например, искать по городу, а не по конкретному адресу."
            action={
              <Button asChild variant="outline">
                <Link href="/search">Сбросить фильтры</Link>
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
        />
      </div>

      {/* ---- Мобильный переключатель Список / Карта ---- */}
      <button
        type="button"
        onClick={() => setMobView((v) => (v === 'list' ? 'map' : 'list'))}
        className="fixed bottom-[22px] left-1/2 z-[25] flex -translate-x-1/2 items-center gap-2 rounded-pill bg-ink px-[22px] py-[13px] text-[15px] font-bold text-white shadow-raised lg:hidden"
      >
        {mobView === 'list' ? (
          <>
            <MapIcon size={18} /> Карта
          </>
        ) : (
          <>
            <ListIcon size={18} /> Список
          </>
        )}
      </button>
    </div>
  );
}
