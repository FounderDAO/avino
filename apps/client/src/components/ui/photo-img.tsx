/**
 * PhotoImg — изображение с тёплым брендовым плейсхолдером и graceful-fallback.
 * Если фото нет (пустой src) или оно не загрузилось — рисует дом-глиф + бренд
 * на фоне photo-ph (TASK-197), без внешнего хотлинка placehold.co.
 * Используем <img>, а не next/image: фото — внешние URL без оптимизации.
 */
'use client';

import * as React from 'react';
import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PhotoImgProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
}

export function PhotoImg({ src, alt = '', className, ...props }: PhotoImgProps) {
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
      >
        <Home size={30} strokeWidth={1.6} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
          Avino
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn('object-cover', className)}
      onError={() => setErr(true)}
      {...props}
    />
  );
}
