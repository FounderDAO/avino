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
import { cn } from '@/lib/utils';
import { PhotoImg } from './photo-img';
import { Lightbox } from './lightbox';
import type { ListingPhoto } from '@/lib/mock/types';

export interface GalleryProps {
  photos: ListingPhoto[];
  alt?: string;
  className?: string;
}

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

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-card sm:grid-cols-2">
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
          className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden sm:aspect-auto sm:row-span-2"
        >
          <PhotoImg src={main.url} alt={alt} priority />

          {/* Счётчик «1 / N» — всегда, когда фото > 1 */}
          {hasMany && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white"
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

        {/* Сетка превью — только на sm+ */}
        <div className="hidden grid-cols-2 gap-2 sm:grid">
          {rest.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightbox(i + 1)}
              className={cn(
                'relative block aspect-[4/3] overflow-hidden',
                rest.length === 1 && 'col-span-2',
              )}
            >
              <PhotoImg src={p.thumb} alt={alt} />
            </button>
          ))}
        </div>
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
