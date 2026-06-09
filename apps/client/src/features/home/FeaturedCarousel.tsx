/**
 * FeaturedCarousel — горизонтальная карусель рекомендованных объектов.
 * Принимает уже отобранные листинги (на сервере через getFeaturedListings).
 * 'use client' — кнопки прокрутки управляют scrollBy у контейнера.
 */
'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PropertyCard } from '@/features/search/PropertyCard';
import type { Listing } from '@/lib/mock/types';

export interface FeaturedCarouselProps {
  title: string;
  subtitle?: string;
  listings: Listing[];
}

export function FeaturedCarousel({ title, subtitle, listings }: FeaturedCarouselProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Прокрутка на ширину карточки (~340px) в нужную сторону.
  const scroll = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * 340, behavior: 'smooth' });
  };

  if (listings.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-12 sm:px-6">
      <div className="mb-[18px] flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-[30px]">{title}</h2>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
        {/* Стрелки прокрутки — только на десктопе */}
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Назад"
            className="flex h-10 w-10 items-center justify-center rounded-pill border-[1.5px] border-border bg-surface text-ink transition-colors duration-150 hover:border-ink"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Вперёд"
            className="flex h-10 w-10 items-center justify-center rounded-pill border-[1.5px] border-border bg-surface text-ink transition-colors duration-150 hover:border-ink"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div
        ref={ref}
        className="grid auto-cols-[minmax(280px,320px)] grid-flow-col gap-5 overflow-x-auto pb-2 [scrollbar-width:thin] [scroll-snap-type:x_proximity]"
      >
        {listings.map((l) => (
          <div key={l.id} className="[scroll-snap-align:start]">
            <PropertyCard listing={l} />
          </div>
        ))}
      </div>
    </section>
  );
}
