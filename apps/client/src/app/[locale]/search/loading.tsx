/**
 * loading.tsx — route-level Suspense fallback для /search (App Router).
 *
 * Зеркалит структуру SearchResults:
 *   - внешний контейнер с теми же flex/height-классами
 *   - левая «карта» (серый плейсхолдер, скрыт на мобайле)
 *   - правая колонка: скелетон heading+счётчик + сетка 6 PropertyCardSkeleton
 *
 * Server component (без 'use client', без хуков). Статическая разметка.
 */
import { PropertyCardSkeleton } from '@/features/search/PropertyCardSkeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function SearchLoading() {
  return (
    /* Совпадает с внешним контейнером SearchResults */
    <div className="relative flex h-[calc(100dvh-var(--header-h)-var(--filterbar-h)-1px)] min-h-[480px]">
      {/* ---- Плейсхолдер карты (слева) — hidden на мобайле, как в SearchResults ---- */}
      <div className="relative h-full hidden lg:block lg:w-3/5 bg-[#e8ede9]" />

      {/* ---- Колонка списка (справа) ---- */}
      <div className="min-w-0 overflow-y-auto w-full lg:w-2/5 lg:max-w-[40%]">
        {/* Заголовок + счётчик */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-3 pt-[18px]">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-[240px]" />
            <Skeleton className="h-4 w-[140px]" />
          </div>
        </div>

        {/* Сетка карточек — 6 скелетонов, те же классы что в SearchResults */}
        <div className="grid grid-cols-1 gap-5 px-5 pb-6 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
