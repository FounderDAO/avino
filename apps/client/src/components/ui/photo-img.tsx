/**
 * PhotoImg — изображение с тёплым плейсхолдером и graceful-fallback.
 * При ошибке загрузки показывает дом-глиф на фоне photo-ph (как в прототипе).
 * Используем <img>, а не next/image: моки — внешние Unsplash без оптимизации.
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

  if (err) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-photo-ph text-[#C9C1B2]',
          className,
        )}
        aria-label={alt}
        role="img"
      >
        <Home size={34} strokeWidth={1.6} />
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
