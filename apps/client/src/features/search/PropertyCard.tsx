/**
 * PropertyCard — карточка объекта (общая для home/search/account).
 * Перенос PropertyCard из ui.jsx. Вся карточка — ссылка на /listing/[id];
 * поверх фото: PromoBadge/«Новое» и FavButton.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MapPin } from 'lucide-react';
import { PhotoImg } from '@/components/ui/photo-img';
import { PromoBadge, NewBadge } from '@/components/ui/promo-badge';
import { FavButton } from '@/components/ui/fav-button';
import { specs, txLabel, propertyTypeLabel, isFresh } from '@/lib/format';
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
  const fresh = isFresh(listing.createdAt);

  return (
    <Link
      href={`/listing/${listing.id}`}
      className={
        'group flex h-full flex-col overflow-hidden rounded-card border border-border/60 bg-surface shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-[3px] hover:shadow-card-hover ' +
        (className ?? '')
      }
    >
      {/* Фото */}
      <div className="relative aspect-[16/11] shrink-0 overflow-hidden">
        <PhotoImg
          src={listing.photos[0]?.thumb ?? ''}
          alt={listing.title}
          className="h-full w-full transition-transform duration-[400ms] group-hover:scale-105"
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
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5">
        <span className="text-xs font-bold uppercase tracking-[0.03em] text-teal">
          {txLabel(listing.tx, tEnums)}
        </span>
        <div className="mt-0.5 truncate text-[23px] font-extrabold tracking-[-0.02em]">
          {fmt.price(listing)}
        </div>

        {/* Характеристики */}
        <div className="mt-2 flex flex-wrap items-center text-[14.5px] font-medium text-muted-foreground">
          {parts.map((p, i) => {
            const m = p.match(/^([\d/.,]+)\s*(.*)$/);
            return (
              <span key={i} className="inline-flex items-center">
                {i > 0 && <span className="mx-[9px] text-border">•</span>}
                {m ? (
                  <>
                    <b className="font-bold text-ink">{m[1]}</b>&nbsp;{m[2]}
                  </>
                ) : (
                  p
                )}
              </span>
            );
          })}
        </div>

        {/* Заголовок */}
        <div className="mt-2 truncate text-base font-bold leading-snug text-ink">
          {listing.title}
        </div>

        {/* Локация */}
        <div className="mt-[5px] flex items-center gap-1 text-[13.5px] text-muted-foreground">
          <MapPin size={14} strokeWidth={1.8} className="shrink-0" />
          <span className="truncate">
            {listing.district} · {listing.address}
          </span>
        </div>

        {/* Низ: тип + агентство */}
        <div className="mt-auto flex items-center gap-1.5 border-t border-border pt-[11px] text-[12.5px] text-muted-foreground">
          <span className={listing.agent.pro ? 'font-semibold text-teal' : 'font-semibold'}>
            {propertyTypeLabel(listing.type, tEnums)}
          </span>
          <span>·</span>
          <span className="truncate">{listing.agent.agency}</span>
        </div>
      </div>
    </Link>
  );
}
