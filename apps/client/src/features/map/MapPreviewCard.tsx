/**
 * MapPreviewCard — превью объявления поверх карты (клик по ценовому пину,
 * Zillow-стиль). Общий для /map (MapSearch) и /search (SearchResults).
 *
 * Сама карточка — обычный PropertyCard (= Link на /listing/[id]): клик по ней
 * перехватывается слотом @modal и открывает ListingModal поверх выдачи.
 * Позиционирует её MapView: якорь у кликнутого пина (проп `preview`), позиция
 * пересчитывается при драге/зуме; здесь — только размер и оболочка.
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
    <div className="w-[min(360px,calc(100vw-32px))]">
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
