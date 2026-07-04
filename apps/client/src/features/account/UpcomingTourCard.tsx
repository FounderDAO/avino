'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { PhotoImg } from '@/components/ui/photo-img';
import {
  useUpdateTourStatusMutation,
  type TourAction,
  type TourRequestItem,
} from '@/store/api/tourRequestsApi';
import { tourToastKey } from './Tours';
import type { TourRole } from './tour-agenda';

/**
 * Карточка предстоящего (CONFIRMED) тура в агенде /account/tours:
 * фото + название объявления (ссылка), дата и окно, роль-бейдж, контрагент
 * (host видит гостя, guest — владельца; телефон владельца приходит только
 * после CONFIRMED) и «Отменить» (host → DECLINE, guest → CANCEL).
 */
export function UpcomingTourCard({ item, role }: { item: TourRequestItem; role: TourRole }) {
  const t = useTranslations('account');
  const tToasts = useTranslations('toasts');
  const [update, { isLoading }] = useUpdateTourStatusMutation();

  const counterpart =
    role === 'host'
      ? { name: item.requester_name as string | null, phone: item.requester_phone as string | null }
      : { name: item.owner?.name ?? null, phone: item.owner?.phone ?? null };
  const cancelAction: TourAction = role === 'host' ? 'DECLINE' : 'CANCEL';
  // item.listing может отсутствовать в окне рассинхрона деплоя (клиент раньше API #312) — страховка, не меняет контракт типов
  const listingId = item.listing?.id;
  const listingTitle = item.listing?.title ?? '';

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
      {listingId ? (
        <Link
          href={`/listing/${listingId}`}
          className="relative block h-[64px] w-[88px] shrink-0 overflow-hidden rounded-[10px]"
        >
          <PhotoImg src={item.listing?.photo_url ?? ''} alt={listingTitle} sizes="88px" />
        </Link>
      ) : (
        <div className="relative block h-[64px] w-[88px] shrink-0 overflow-hidden rounded-[10px]">
          <PhotoImg src={item.listing?.photo_url ?? ''} alt={listingTitle} sizes="88px" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {listingId ? (
          <Link
            href={`/listing/${listingId}`}
            className="block truncate text-[15px] font-semibold hover:text-teal"
          >
            {listingTitle}
          </Link>
        ) : (
          <span className="block truncate text-[15px] font-semibold">{listingTitle}</span>
        )}
        <div className="text-[13px] text-muted-foreground">
          {item.requested_date} {t('tours.on')} {item.window_start}–{item.window_end}
        </div>
        <div className="truncate text-[13px]">
          <span className="rounded-badge bg-mint px-1.5 py-0.5 text-[11px] font-bold text-teal-deep">
            {t(role === 'host' ? 'tours.roleHost' : 'tours.roleGuest')}
          </span>
          {counterpart.name && <span className="ml-1.5">{counterpart.name}</span>}
          {counterpart.phone && (
            <>
              <span className="text-muted-foreground"> · </span>
              <a href={`tel:${counterpart.phone}`} className="text-teal hover:text-teal-deep">
                {counterpart.phone}
              </a>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => {
          // updateTourStatus в suppress-list middleware — тостим вручную.
          void update({ id: item.id, action: cancelAction })
            .unwrap()
            .then(() => toast.success(tToasts(tourToastKey(cancelAction))))
            .catch(() => toast.error(tToasts('tourActionFailed')));
        }}
        className="rounded-pill border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-bg disabled:opacity-50"
      >
        {t('tours.cancel')}
      </button>
    </div>
  );
}
