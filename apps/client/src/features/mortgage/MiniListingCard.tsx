/**
 * MiniListingCard — шапка экранов калькулятора ипотеки (спека §4.1): фото
 * 48×48 (плейсхолдер PhotoImg, если фото нет), «{цена} · {N комнат}» и адрес
 * в одну строку с ellipsis. Тот же паттерн мини-карточки, что и в
 * ShareButton.tsx (features/detail), но с квадратным фото 48×48.
 */
import { PhotoImg } from '@/components/ui/photo-img';
import { formatMoney, formatRooms } from '@/lib/format';
import type { T } from '@/lib/format';
import type { Currency, Listing } from '@/lib/mock/types';

export interface MiniListingCardProps {
  listing: Pick<Listing, 'title' | 'rooms' | 'district' | 'address' | 'photos'>;
  /** Цена в валюте показа (уже сконвертирована); null, пока курс грузится. */
  price: number | null;
  display: Currency;
  tUnits: T;
}

export function MiniListingCard({ listing, price, display, tUnits }: MiniListingCardProps) {
  const rooms = formatRooms(listing.rooms, tUnits);
  const priceLabel = price != null ? formatMoney(price, display, tUnits) : '…';
  const title = rooms ? `${priceLabel} · ${rooms}` : priceLabel;
  const address = [listing.district, listing.address].filter(Boolean).join(' · ');
  const photo = listing.photos?.[0]?.url ?? '';

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-[12px] border border-border bg-surface-2 p-3">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px]">
        <PhotoImg src={photo} alt={listing.title} fill sizes="48px" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold text-ink">{title}</p>
        {address && (
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{address}</p>
        )}
      </div>
    </div>
  );
}
