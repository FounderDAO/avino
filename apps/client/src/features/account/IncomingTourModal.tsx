'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  useUpdateTourStatusMutation,
  type TourRequestItem,
  type TourAction,
} from '@/store/api/tourRequestsApi';
import { getApiError } from '@/store/api/apiError';

export interface IncomingTourModalProps {
  item: TourRequestItem | null;
  onClose: () => void;
}

/** Модалка входящего запроса на тур: детали + подтвердить/отклонить (только PENDING). */
export function IncomingTourModal({ item, onClose }: IncomingTourModalProps) {
  const t = useTranslations('account');
  const tToasts = useTranslations('toasts');
  const [update, { isLoading }] = useUpdateTourStatusMutation();
  const [error, setError] = React.useState<string | null>(null);

  // Сброс ошибки при смене/закрытии запроса.
  React.useEffect(() => {
    setError(null);
  }, [item?.id]);

  const act = React.useCallback(
    async (action: TourAction) => {
      if (!item) return;
      setError(null);
      try {
        await update({ id: item.id, action }).unwrap();
        toast.success(
          tToasts(action === 'CONFIRM' ? 'tourConfirmed' : 'tourDeclined'),
        );
        onClose();
      } catch (err) {
        const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
        setError(apiErr?.message ?? t('tours.actionError'));
      }
    },
    [item, update, onClose, t, tToasts],
  );

  const open = item != null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          {item && (
            <>
              <div className="flex items-center justify-between gap-3">
                <Dialog.Title className="text-xl font-extrabold">
                  {t('tours.modalTitle')}
                </Dialog.Title>
                <span className="rounded-badge bg-mint px-2 py-0.5 text-[11.5px] font-bold text-teal-deep">
                  {t(`tours.status.${item.status}`)}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <div>
                  <div className="text-[15px] font-semibold">{item.requester_name}</div>
                  <a
                    href={`tel:${item.requester_phone}`}
                    className="text-[14px] text-teal hover:text-teal-deep"
                  >
                    {item.requester_phone}
                  </a>
                </div>

                <div className="text-[14px] text-muted-foreground">
                  {item.requested_date} {t('tours.on')} {item.window_start}–{item.window_end}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="text-[13px] font-semibold">{t('tours.message')}</div>
                  {item.message?.trim() ? (
                    <p className="whitespace-pre-wrap text-[14px]">{item.message}</p>
                  ) : (
                    <p className="text-[14px] text-muted-foreground">{t('tours.noMessage')}</p>
                  )}
                </div>

                <Link
                  href={`/listing/${item.listing_id}`}
                  className="text-[14px] font-semibold text-teal hover:text-teal-deep"
                >
                  {t('tours.openListing')}
                </Link>

                {error && <div className="text-[12.5px] text-red">{error}</div>}

                {item.status === 'PENDING' && (
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => void act('CONFIRM')}
                      className="rounded-pill bg-green px-4 py-2 text-[14px] font-bold text-white hover:brightness-95 disabled:opacity-50"
                    >
                      {t('tours.confirm')}
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => void act('DECLINE')}
                      className="rounded-pill bg-red px-4 py-2 text-[14px] font-bold text-white hover:bg-red-press disabled:opacity-50"
                    >
                      {t('tours.decline')}
                    </button>
                  </div>
                )}
              </div>

              <Dialog.Close
                aria-label={t('tours.close')}
                className="absolute right-4 top-4 text-muted-foreground hover:text-ink"
              >
                ✕
              </Dialog.Close>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
