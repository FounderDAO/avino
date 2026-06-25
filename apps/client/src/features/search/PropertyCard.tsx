/**
 * PropertyCard — компактная карточка объекта (Zillow-минимализм).
 * Вся карточка — ссылка на /listing/[id]; поверх фото: PromoBadge/«Новое» и
 * FavButton. Тело: цена → строка спеков (комнаты·площадь·…·тип жилья) → локация.
 * Лейбл сделки, отдельный заголовок и строка «тип · агентство» убраны намеренно
 * (компактность, ADR/спек 2026-06-26).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MapPin } from 'lucide-react';
import { PhotoImg } from '@/components/ui/photo-img';
import { PromoBadge, NewBadge } from '@/components/ui/promo-badge';
import { FavButton } from '@/components/ui/fav-button';
import { specs, propertyTypeLabel, isFresh } from '@/lib/format';
import type { Listing } from '@/lib/mock/types';
import { usePriceFormatter } from '@/lib/usePriceFormatter';

export interface PropertyCardProps {
  listing: Listing;
  className?: string;
}

export function PropertyCard({ listing, className }: PropertyCardProps) {
  const tUnits = useTranslations('units');
  const tEnums = useTranslations('enums');
  const fmt = usePriceFormatter();
  const parts = specs(listing, tUnits);
  // Тип жилья — последним элементом строки спеков (как «House for sale» у Zillow).
  const specParts = [...parts, propertyTypeLabel(listing.type, tEnums)];
  const fresh = isFresh(listing.createdAt);

  return (
    <Link
      href={`/listing/${listing.id}`}
      className={
        'group flex h-full flex-col overflow-hidden rounded-card border border-border/60 bg-surface shadow-card transition-shadow duration-200 hover:shadow-card-hover ' +
        (className ?? '')
      }
    >
      {/* Фото */}
      <div className="relative aspect-[3/2] shrink-0 overflow-hidden">
        <PhotoImg
          src={listing.photos[0]?.thumb ?? ''}
          alt={listing.title}
          className="transition-transform duration-[400ms] group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <PromoBadge promo={listing.promo} />
          {fresh && listing.promo === 'NORMAL' && <NewBadge />}
        </div>
        <div className="absolute right-2.5 top-2.5">
          <FavButton listingId={listing.id} />
        </div>
      </div>

      {/* Тело */}
      <div className="flex flex-1 flex-col px-3 py-2.5">
        <div className="truncate text-[19px] font-bold tracking-[-0.01em] text-ink">
          {fmt.price(listing)}
        </div>

        {/* Характеристики + тип жилья одной строкой */}
        <div className="mt-1 flex flex-wrap items-center text-[13px] text-muted-foreground">
          {specParts.map((p, i) => (
            <span key={i} className="inline-flex items-center">
              {i > 0 && <span className="mx-[7px] text-border">·</span>}
              {p}
            </span>
          ))}
        </div>

        {/* Локация (заголовок-адрес, по-зилловски) */}
        <div className="mt-1 flex items-center gap-1 text-[12.5px] text-muted-foreground">
          <MapPin size={13} strokeWidth={1.8} className="shrink-0" />
          <span className="truncate">
            {listing.district} · {listing.address}
          </span>
        </div>
      </div>
    </Link>
  );
}
