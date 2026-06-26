/**
 * CardPhotoCarousel — слайдер фото внутри карточки (Zillow-стиль).
 * Стрелки ‹ › появляются при hover карточки; точки-индикаторы снизу (макс 5).
 * Заворачивает по кругу. preventDefault/stopPropagation — чтобы клик по
 * стрелке/точке не триггерил навигацию по карточке-ссылке (как FavButton).
 * Деградация: 0 фото → плейсхолдер PhotoImg, 1 фото → без стрелок/точек.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PhotoImg } from './photo-img';
import { cn } from '@/lib/utils';
import type { ListingPhoto } from '@/lib/mock/types';

const MAX_DOTS = 5;

export interface CardPhotoCarouselProps {
  photos: ListingPhoto[];
  alt: string;
  className?: string;
  sizes?: string;
}

export function CardPhotoCarousel({ photos, alt, className, sizes }: CardPhotoCarouselProps) {
  const t = useTranslations('common');
  const [current, setCurrent] = React.useState(0);
  const n = photos.length;

  // Безопасный модуль (заворот по кругу) + гашение навигации по карточке-ссылке.
  const go = (next: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrent(((next % n) + n) % n);
  };

  const dotCount = Math.min(n, MAX_DOTS);
  // При >5 фото точек всё равно 5; активная — по пропорции позиции.
  const activeDot = n <= MAX_DOTS ? current : Math.round((current / (n - 1)) * (dotCount - 1));
  // Фото, на которое ведёт точка i (инверсия пропорции при усечении).
  const dotTarget = (i: number) =>
    n <= MAX_DOTS ? i : Math.round((i / (dotCount - 1)) * (n - 1));

  const arrowCls =
    'absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center ' +
    'rounded-full bg-white/90 text-ink opacity-0 shadow transition-opacity ' +
    'group-hover:opacity-100';

  return (
    <div className={cn('absolute inset-0', className)}>
      <PhotoImg
        src={photos[current]?.thumb ?? ''}
        alt={alt}
        sizes={sizes}
        className="transition-transform duration-[400ms] group-hover:scale-105"
      />

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label={t('photoPrev')}
            onClick={go(current - 1)}
            className={cn(arrowCls, 'left-2')}
          >
            <ChevronLeft size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            aria-label={t('photoNext')}
            onClick={go(current + 1)}
            className={cn(arrowCls, 'right-2')}
          >
            <ChevronRight size={18} strokeWidth={2.2} />
          </button>

          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {Array.from({ length: dotCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={t('goToPhoto', { n: i + 1 })}
                aria-current={i === activeDot}
                onClick={go(dotTarget(i))}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  i === activeDot ? 'bg-white' : 'bg-white/55',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
