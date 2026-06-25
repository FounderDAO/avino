/**
 * PhotoImg — изображение с тёплым брендовым плейсхолдером и graceful-fallback.
 * Если фото нет (пустой src) или оно не загрузилось — рисует дом-глиф + бренд
 * на фоне photo-ph (TASK-197), без внешнего хотлинка placehold.co.
 *
 * Использует next/image для оптимизации (WebP/AVIF, lazy, LCP priority).
 * Хосты фото объявлены в next.config.mjs images.remotePatterns (cdn.avino.uz).
 *
 * По умолчанию fill=true (заполняет position:relative-контейнер).
 * Для лайтбокса (intrinsic sizing, object-contain) передай fill={false}.
 *
 * Контейнер при fill=true должен иметь position:relative и явные размеры
 * (aspect-ratio или h-*). Это выполнено во всех местах использования:
 *   Gallery — .relative.aspect-[4/3], .relative.block.aspect-[4/3]
 *   PropertyCard — .relative.aspect-[16/11]
 *   MyListings — .relative.h-[84px]
 */
'use client';

import * as React from 'react';
import Image from 'next/image';
import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PhotoImgProps {
  src: string;
  alt?: string;
  className?: string;
  /**
   * Когда true (дефолт) — next/image fill + object-cover; контейнер: position:relative.
   * Когда false — intrinsic-режим (лайтбокс): width/height из стилей, object-contain.
   */
  fill?: boolean;
  /**
   * Когда true — добавляет priority (eager + preload): используй для LCP-элементов
   * (главное фото галереи, первые карточки выдачи).
   */
  priority?: boolean;
  /**
   * Hints браузеру о ширине изображения в разных точках останова.
   * Актуально только при fill=true.
   */
  sizes?: string;
  /** Пробросить onClick (лайтбокс). */
  onClick?: React.MouseEventHandler<HTMLElement>;
}

export function PhotoImg({
  src,
  alt = '',
  className,
  fill = true,
  priority = false,
  sizes = '(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw',
  onClick,
}: PhotoImgProps) {
  const [err, setErr] = React.useState(false);

  // Нет фото или фото не загрузилось → осмысленный брендовый плейсхолдер
  // (а не пустой серый бокс), без внешнего хотлинка (TASK-197).
  if (!src || err) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-1 bg-photo-ph text-[#B7AE9C]',
          className,
        )}
        aria-label={alt}
        role="img"
        onClick={onClick}
      >
        <Home size={30} strokeWidth={1.6} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          Avino
        </span>
      </div>
    );
  }

  if (fill) {
    // fill-режим: контейнер обязан быть position:relative с явными размерами.
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn('object-cover', className)}
        onError={() => setErr(true)}
        onClick={onClick}
      />
    );
  }

  // Intrinsic-режим для лайтбокса: браузер определяет размеры через CSS.
  // next/image fill несовместим с object-contain + max-h, используем <img>.
  /* eslint-disable @next/next/no-img-element */
  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      className={cn('object-contain', className)}
      onError={() => setErr(true)}
      onClick={onClick}
    />
  );
}
