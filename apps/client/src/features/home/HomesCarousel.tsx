'use client';

import { PropertyCard } from '@/features/search/PropertyCard';
import { useSearchListingsQuery } from '@/store/api/searchApi';

/**
 * HomesCarousel (TASK-192) — горизонтальная лента «Объявления для вас».
 *
 * Клиентский остров на главной. Переиспользует `searchApi`
 * (`GET /api/v1/search`, ADR-006/007: VIP > TOP > NORMAL по умолчанию) —
 * отдельного listingsApi нет, публичный бровз идёт через поиск
 * (CLAUDE.md §4: только RTK Query, без fetch/axios в компонентах).
 *
 * Берём небольшой `limit` под ленту. Карточки переиспользуют <PropertyCard/>
 * и форматтеры из features/search. Обрабатываются три состояния: загрузка
 * (скелетоны), ошибка и пустая выдача — все graceful, без падений.
 */

const STRINGS = {
  title: 'Объявления для вас',
  loading: 'Загружаем объявления…',
  error: 'Не удалось загрузить объявления. Попробуйте позже.',
  empty: 'Пока нет объявлений.',
} as const;

/** Сколько карточек тянуть в ленту (компактный размер под карусель). */
const CAROUSEL_LIMIT = 8;

/** Класс карточки в ленте: фикс. ширина + snap-выравнивание при скролле. */
const ITEM_CLASS = 'w-[280px] shrink-0 snap-start';

export function HomesCarousel() {
  const { data, isLoading, isError } = useSearchListingsQuery({
    limit: CAROUSEL_LIMIT,
  });

  const listings = data?.data ?? [];

  return (
    <section aria-labelledby="homes-carousel-title">
      <h2
        id="homes-carousel-title"
        className="mb-4 text-2xl font-bold tracking-tight text-foreground"
      >
        {STRINGS.title}
      </h2>

      {isLoading ? (
        // Скелетоны: повторяют аспект карточки, без layout-shift.
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`${ITEM_CLASS} animate-pulse overflow-hidden rounded-xl border border-border bg-card`}
              aria-hidden="true"
            >
              <div className="aspect-[4/3] bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-1/2 rounded bg-muted" />
                <div className="h-3 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            </div>
          ))}
          <span className="sr-only">{STRINGS.loading}</span>
        </div>
      ) : isError ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {STRINGS.error}
        </p>
      ) : listings.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {STRINGS.empty}
        </p>
      ) : (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
          {listings.map((listing) => (
            <div key={listing.id} className={ITEM_CLASS}>
              <PropertyCard listing={listing} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
