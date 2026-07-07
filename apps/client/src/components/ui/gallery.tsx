/**
 * Gallery — галерея фото объявления (для detail).
 * Большое главное фото + сетка превью; клик открывает Lightbox.
 *
 * Мобайл: только главное фото, но на нём оверлей «1 / N» + «Показать все фото»
 * (TASK-198). Структура главного фото — div.relative, без вложенных button:
 * клик по обёртке открывает лайтбокс; абсолютный <span> — счётчик (не интерактивен);
 * отдельная <button> снизу-слева — «Показать все фото» (sm:hidden).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PhotoImg } from './photo-img';
import { Lightbox } from './lightbox';
import type { ListingPhoto } from '@/lib/mock/types';

export interface GalleryProps {
  photos: ListingPhoto[];
  alt?: string;
  className?: string;
}

/**
 * Раскладка правой мозаики по числу превью (1–4) — без «дыр» в сетке:
 * 1 → одно фото на всю правую колонку; 2 → стопкой; 3 → верхнее на всю ширину
 * + два снизу; 4 → сетка 2×2 (по-зилловски).
 */
const MOSAIC_GRID: Record<number, string> = {
  1: 'sm:grid-cols-1 sm:grid-rows-1',
  2: 'sm:grid-cols-1 sm:grid-rows-2',
  3: 'sm:grid-cols-2 sm:grid-rows-2',
  4: 'sm:grid-cols-2 sm:grid-rows-2',
};
/** Спаны отдельных тайлов (только там, где нужно перекрыть автопоток). */
const MOSAIC_TILE: Record<number, Record<number, string>> = {
  3: { 0: 'sm:col-span-2' },
};

export function Gallery({ photos, alt, className }: GalleryProps) {
  const [lightbox, setLightbox] = React.useState<number | null>(null);
  const t = useTranslations('listing');

  // Нет фото → брендовый плейсхолдер вместо пустоты (TASK-197).
  if (photos.length === 0) {
    return (
      <div className={className}>
        {/* Плейсхолдер: fill=true требует relative-контейнер */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card sm:aspect-[16/9]">
          <PhotoImg src="" alt={alt} />
        </div>
      </div>
    );
  }

  const main = photos[0];
  const rest = photos.slice(1, 5);
  const total = photos.length;
  const hasMany = total > 1;
  // Мозаику справа показываем, только когда есть превью; иначе главное фото
  // растягиваем на всю ширину (без пустой правой колонки).
  const showMosaic = rest.length > 0;
  // Сколько фото осталось «за кадром» сверх показанных (главное + до 4 превью).
  const moreCount = total - (1 + rest.length);

  return (
    <div className={className}>
      <div
        className={cn(
          'grid grid-cols-1 gap-2 overflow-hidden rounded-card',
          // Фикс-пропорция контейнера на sm+ даёт мозаике равные по высоте колонки.
          showMosaic && 'sm:aspect-[2/1] sm:grid-cols-2',
        )}
      >
        {/*
         * Главное фото: кликабельный div (не button) открывает лайтбокс.
         * Внутри — абсолютный span-счётчик и отдельная button «Показать все».
         * Никаких вложенных <button> в <button>.
         */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setLightbox(0)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setLightbox(0);
            }
          }}
          aria-label={
            hasMany
              ? t('gallery.counterAria', { current: 1, total })
              : (alt ?? '')
          }
          className={cn(
            'relative block aspect-[4/3] w-full cursor-pointer overflow-hidden',
            showMosaic ? 'sm:aspect-auto sm:h-full' : 'sm:aspect-[16/9]',
          )}
        >
          <PhotoImg src={main.url} alt={alt} priority />

          {/* Счётчик «1 / N» — на мобайле (на sm+ роль счётчика берёт мозаика). */}
          {hasMany && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white sm:hidden"
            >
              {t('gallery.counter', { current: 1, total })}
            </span>
          )}

          {/* Кнопка «Показать все фото» — только на мобайле */}
          {hasMany && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(0);
              }}
              className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white hover:bg-black/80 sm:hidden"
            >
              {t('gallery.showAll')}
            </button>
          )}
        </div>

        {/* Мозаика превью — только на sm+, раскладка зависит от числа фото. */}
        {showMosaic && (
          <div className={cn('hidden gap-2 sm:grid sm:h-full', MOSAIC_GRID[rest.length])}>
            {rest.map((p, i) => {
              const isLast = i === rest.length - 1;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(i + 1)}
                  className={cn(
                    'relative block h-full w-full overflow-hidden',
                    MOSAIC_TILE[rest.length]?.[i],
                  )}
                >
                  <PhotoImg src={p.thumb} alt={alt} />

                  {/* «Показать все N фото» — пилюлей на последнем тайле, если фото
                      больше, чем помещается в мозаику (по-зилловски). */}
                  {isLast && moreCount > 0 && (
                    <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-bold text-ink shadow-sm">
                      <LayoutGrid size={14} strokeWidth={2.2} />
                      {t('gallery.seeAllCount', { total })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {lightbox !== null && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
          alt={alt}
        />
      )}
    </div>
  );
}
