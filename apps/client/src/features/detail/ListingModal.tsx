/**
 * ListingModal — клиентская оболочка деталки в модальном окне (intercepting route).
 * Десктоп: центрированная панель max-w-1100/max-h-92vh со своим скроллом.
 * Мобайл (<lg): полноэкранный лист h-dvh. Закрытие (Esc/фон/✕/Назад) → router.back().
 * Тулбар: ссылка «Открыть страницу ↗» (полная страница в новой вкладке) + ✕.
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';

export interface ListingModalProps {
  listingId: string;
  children: React.ReactNode;
}

export function ListingModal({ listingId, children }: ListingModalProps) {
  const t = useTranslations('listing');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = React.useState(true);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) router.back();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-[81] flex flex-col bg-surface shadow-raised
            inset-0 h-dvh w-full
            lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-auto lg:max-h-[92vh]
            lg:w-[calc(100%-48px)] lg:max-w-[1100px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[20px]"
        >
          <Dialog.Title className="sr-only">{t('modalTitle')}</Dialog.Title>

          {/* Тулбар */}
          <div className="sticky top-0 z-10 flex items-center justify-end gap-1 border-b border-border/60 bg-surface/95 px-3 py-2 backdrop-blur">
            <Link
              href={`/listing/${listingId}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13.5px] font-bold text-teal hover:bg-surface-2"
            >
              <ExternalLink size={15} strokeWidth={2.2} />
              {t('openFullPage')}
            </Link>
            <Dialog.Close
              aria-label={tCommon('close')}
              className="rounded-full p-2 text-muted-foreground hover:bg-surface-2 hover:text-ink"
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Контент со скроллом */}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
