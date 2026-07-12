/**
 * LimitReachedModal — «Достигнут лимит объявлений» (визард /sell/new).
 * Открывается ListingNew при 422 ACTIVE_LISTING_LIMIT_REACHED от createListing.
 * N в тексте — activeListingLimit из useGetPublicSettingsQuery(); пока
 * грузится/ошибка — текст без числа (bodyNoLimit).
 * Портал через Dialog.Portal (radix-ui) — как SaveSearchModal/LoginModal:
 * `.fade-up` на странице создаёт containing block, ломающий `fixed inset-0`
 * (см. components/ui/lightbox.tsx), Dialog.Portal выносит оверлей в body.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { useGetPublicSettingsQuery } from '@/store/api/publicSettingsApi';

export interface LimitReachedModalProps {
  open: boolean;
  onClose: () => void;
}

export function LimitReachedModal({ open, onClose }: LimitReachedModalProps) {
  // Namespace 'listingNew' + вложенные ключи 'limitModal.*' — как остальные
  // строки визарда (t = useTranslations('listingNew'), см. ListingNew.tsx).
  const t = useTranslations('listingNew');
  const router = useRouter();
  const { data: settings } = useGetPublicSettingsQuery();

  const limit = settings?.activeListingLimit;
  const body =
    typeof limit === 'number'
      ? t('limitModal.body', { limit })
      : t('limitModal.bodyNoLimit');

  const handleBecomeAgent = () => {
    onClose();
    router.push('/become-agent');
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-8 shadow-raised"
        >
          <Dialog.Close
            aria-label={t('limitModal.close')}
            className="absolute right-4 top-4 p-1 text-muted-foreground hover:text-ink"
          >
            <X size={22} />
          </Dialog.Close>

          <Dialog.Title className="text-[24px]">
            {t('limitModal.title')}
          </Dialog.Title>
          <Dialog.Description className="mt-3 text-[14.5px] leading-[1.6] text-muted-foreground">
            {body}
          </Dialog.Description>

          <div className="mt-6 flex flex-col gap-2.5">
            <Button size="lg" className="w-full" onClick={handleBecomeAgent}>
              {t('limitModal.becomeAgent')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={onClose}
            >
              {t('limitModal.dismiss')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
