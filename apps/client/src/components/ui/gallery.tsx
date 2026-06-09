/**
 * Gallery — галерея фото объявления (для detail).
 * Большое главное фото + сетка превью; клик открывает Lightbox.
 */
'use client';

import * as React from 'react';
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

  if (photos.length === 0) return null;

  const main = photos[0];
  const rest = photos.slice(1, 5);

  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-card sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setLightbox(0)}
          className="relative block aspect-[4/3] w-full overflow-hidden sm:aspect-auto sm:row-span-2"
        >
          <PhotoImg src={main.url} alt={alt} className="h-full w-full" />
        </button>
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
              <PhotoImg src={p.thumb} alt={alt} className="h-full w-full" />
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
