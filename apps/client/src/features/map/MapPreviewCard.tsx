/**
 * MapPreviewCard — превью объявления поверх карты (клик по ценовому пину,
 * Zillow-стиль). Общий для /map (MapSearch) и /search (SearchResults).
 *
 * Сама карточка — обычный PropertyCard (= Link на /listing/[id]): клик по ней
 * перехватывается слотом @modal и открывает ListingModal поверх выдачи.
 * Позиционируется absolute у нижнего края ближайшего relative-родителя
 * (контейнер карты).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { PropertyCard } from '@/features/search/PropertyCard';
import type { Listing } from '@/lib/mock/types';

export interface MapPreviewCardProps {
  listing: Listing;
  onClose: () => void;
}

export function MapPreviewCard({ listing, onClose }: MapPreviewCardProps) {
  const t = useTranslations('search');
  return (
    <div className="absolute bottom-4 left-3 right-3 z-[1000] mx-auto max-w-sm sm:left-4 sm:right-auto">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('map.preview.close')}
          className="absolute -right-2 -top-2 z-[1] grid h-7 w-7 place-items-center rounded-full bg-ink text-white shadow-raised"
        >
          <X size={15} strokeWidth={2.4} />
        </button>
        <PropertyCard listing={listing} className="bg-surface shadow-raised" />
      </div>
    </div>
  );
}
