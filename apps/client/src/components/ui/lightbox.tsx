/**
 * Lightbox — полноэкранный просмотр фото с навигацией.
 * Управляется индексом; стрелки/клавиатура листают, клик по фону закрывает.
 */
'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { PhotoImg } from './photo-img';
import type { ListingPhoto } from '@/lib/mock/types';

export interface LightboxProps {
  photos: ListingPhoto[];
  /** Текущий индекс. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  alt?: string;
}

export function Lightbox({ photos, index, onIndexChange, onClose, alt }: LightboxProps) {
  const total = photos.length;
  const prev = React.useCallback(
    () => onIndexChange((index - 1 + total) % total),
    [index, total, onIndexChange],
  );
  const next = React.useCallback(
    () => onIndexChange((index + 1) % total),
    [index, total, onIndexChange],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, prev, next]);

  if (!photos[index]) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-5 top-5 text-white/80 hover:text-white"
      >
        <X size={28} />
      </button>

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Назад"
          className="absolute left-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <ChevronLeft size={26} />
        </button>
      )}

      <PhotoImg
        src={photos[index].url}
        alt={alt}
        className="max-h-[88vh] max-w-[92vw] rounded-card object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Вперёд"
          className="absolute right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <ChevronRight size={26} />
        </button>
      )}

      <div className="absolute bottom-5 text-sm font-semibold text-white/80">
        {index + 1} / {total}
      </div>
    </div>
  );
}
