/**
 * FavButton — круглая кнопка-сердечко (перенос FavBtn из ui.jsx).
 * Завязана на favoritesSlice: переключает листинг в избранном.
 * Останавливает всплытие, чтобы не триггерить клик по карточке-ссылке.
 */
'use client';

import * as React from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsFavorite, useToggleFavorite } from '@/store/favorites';

export interface FavButtonProps {
  /** id листинга для toggle в избранном. */
  listingId: string;
  /** Размер круга в px (по умолчанию 38). */
  size?: number;
  className?: string;
}

export function FavButton({ listingId, size = 38, className }: FavButtonProps) {
  const active = useIsFavorite(listingId);
  const toggle = useToggleFavorite();

  return (
    <button
      type="button"
      aria-label={active ? 'Убрать из избранного' : 'В избранное'}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggle(listingId);
      }}
      className={cn(
        'flex items-center justify-center rounded-full border-none shadow-[0_2px_8px_rgba(40,34,24,0.22)] transition-transform duration-150 active:scale-90',
        active ? 'bg-white text-red' : 'bg-white/90 text-ink',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Heart size={size * 0.5} strokeWidth={2.1} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
