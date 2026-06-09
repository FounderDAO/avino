'use client';

import Link from 'next/link';
import { Heart, MapPin, Share2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ListingDetail } from '@/store/api/listingsApi';
import {
  PROPERTY_TYPE_LABELS,
  formatPrice,
  formatRooms,
} from '@/features/search/format';
import {
  PROMOTION_BADGE_LABELS,
  formatArea,
  formatFloor,
  isPromotionActive,
} from './format';

/**
 * Шапка карточки объявления (TASK-153, дизайн-спек §4.3): крупная цена,
 * бейдж VIP/TOP, specs-строка с dot-bullet разделителями, адрес и действия.
 *
 * Избранное и жалоба требуют входа (авторизация — TASK-150), поэтому ведут на
 * `/login`. «Поделиться» работает и для гостя: Web Share API с фолбэком на
 * копирование ссылки в буфер.
 */

function ActionLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
    >
      {children}
    </Link>
  );
}

export function DetailHeader({ listing }: { listing: ListingDetail }) {
  const promoLabel = isPromotionActive(listing.promotion_expires_at)
    ? PROMOTION_BADGE_LABELS[listing.promotion_type]
    : undefined;

  // Specs в порядке спека: комнаты · площадь · этаж · год; пустые отброшены.
  const specs = [
    formatRooms(listing.rooms),
    formatArea(listing.area),
    formatFloor(listing.floor, listing.total_floors),
    listing.year_built ? `${listing.year_built} г.` : null,
  ].filter((s): s is string => Boolean(s) && s !== '—');

  const onShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: listing.title, url });
        return;
      } catch {
        // Пользователь отменил шаринг — молча выходим.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Буфер недоступен (нет https/прав) — деградируем без ошибки.
    }
  };

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          {promoLabel && (
            <span
              className={cn(
                'w-fit rounded-md px-2 py-0.5 text-xs font-bold',
                promoLabel === 'VIP'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground',
              )}
            >
              {promoLabel}
            </span>
          )}
          <p className="text-3xl font-extrabold tracking-tight text-foreground sm:text-[40px] sm:leading-none">
            {formatPrice(listing.price, listing.currency)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            aria-label="Поделиться"
            title="Поделиться"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
          >
            <Share2 className="size-5" />
          </button>
          <ActionLink href="/login" label="В избранное">
            <Heart className="size-5" />
          </ActionLink>
          <ActionLink href="/login" label="Пожаловаться">
            <TriangleAlert className="size-5" />
          </ActionLink>
        </div>
      </div>

      <h1 className="text-xl font-bold tracking-tight text-foreground">
        {PROPERTY_TYPE_LABELS[listing.property_type]} — {listing.title}
      </h1>

      {specs.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {specs.map((spec, i) => (
            <li key={spec} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true">·</span>}
              <span className="font-semibold text-foreground">{spec}</span>
            </li>
          ))}
        </ul>
      )}

      {listing.address && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          {listing.address}
          {listing.address_note && (
            <span className="text-muted-foreground">· {listing.address_note}</span>
          )}
        </p>
      )}
    </header>
  );
}
