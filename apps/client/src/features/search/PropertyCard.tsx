import Link from 'next/link';
import { PromotionType } from '@avino/shared';
import { cn } from '@/lib/utils';
import type { ListingCard } from '@/store/api/searchApi';
import {
  PROMOTION_LABELS,
  PROPERTY_TYPE_LABELS,
  formatPrice,
  formatRooms,
} from './format';

/**
 * Карточка объявления в выдаче поиска (TASK-151).
 * VIP/TOP получают цветной бейдж — визуальное отражение promotion-приоритета
 * (`effective_tier`, истёкшее промо уже трактуется бэкендом как NORMAL).
 */
export function PropertyCard({ listing }: { listing: ListingCard }) {
  const tier = listing.effective_tier;
  const promoLabel = PROMOTION_LABELS[tier];

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md',
        tier === PromotionType.VIP && 'ring-1 ring-primary/40',
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {listing.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- произвольный CDN-хост; next/image требует remotePatterns
          <img
            src={listing.thumbnail_url}
            alt={listing.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Без фото
          </div>
        )}
        {promoLabel && (
          <span
            className={cn(
              'absolute left-2 top-2 rounded-md px-2 py-0.5 text-xs font-semibold',
              tier === PromotionType.VIP
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent text-accent-foreground',
            )}
          >
            {promoLabel}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-base font-semibold text-foreground">
          {formatPrice(listing.price, listing.currency)}
        </p>
        <h3 className="line-clamp-2 text-sm text-foreground">{listing.title}</h3>
        <p className="mt-auto text-xs text-muted-foreground">
          {PROPERTY_TYPE_LABELS[listing.property_type]} · {formatRooms(listing.rooms)}
        </p>
      </div>
    </Link>
  );
}
