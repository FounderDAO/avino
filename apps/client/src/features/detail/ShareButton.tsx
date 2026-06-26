/**
 * ShareButton — круглая кнопка-иконка «Поделиться» на детальной странице.
 * По клику открывает модал (radix Dialog) с превью объявления и каналами шеринга:
 * Копировать ссылку, Telegram, WhatsApp, Email.
 *
 * Паттерн модала повторяет TourRequestModal: Dialog.Root/Portal/Overlay/Content,
 * классы fade-up, overlay z-[80], content z-[81].
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { Share2, Link2, Send, MessageCircle, Mail } from 'lucide-react';
import { PhotoImg } from '@/components/ui/photo-img';
import { specs, propertyTypeLabel } from '@/lib/format';
import { usePriceFormatter } from '@/lib/usePriceFormatter';
import type { Listing } from '@/lib/mock/types';

export interface ShareButtonProps {
  listing: Listing;
}

// ─── ShareModal ────────────────────────────────────────────────────────────────

export interface ShareModalProps {
  listing: Listing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareModal({ listing, open, onOpenChange }: ShareModalProps) {
  const t = useTranslations('share');
  const tUnits = useTranslations('units');
  const tEnums = useTranslations('enums');
  const fmt = usePriceFormatter();

  // shareUrl вычисляем только на клиенте (window доступен после монтирования).
  const [shareUrl, setShareUrl] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
    if (open) {
      setShareUrl(window.location.href);
      setCopied(false);
    }
  }, [open]);

  // Cleanup таймера при размонтировании.
  React.useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const formattedPrice = fmt.price(listing);
  const shareText = t('shareText', { title: listing.title, price: formattedPrice });

  const specParts = [
    ...specs(listing, tUnits),
    propertyTypeLabel(listing.type, tEnums),
  ];

  const handleCopy = React.useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard недоступен (HTTP или permissions) — молча игнорируем
    }
  }, [shareUrl]);

  const firstPhoto = listing.photos?.[0]?.url ?? '';

  const tgHref = shareUrl
    ? `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`
    : '#';
  const waHref = shareUrl
    ? `https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`
    : '#';
  const mailHref = shareUrl
    ? `mailto:?subject=${encodeURIComponent(listing.title)}&body=${encodeURIComponent(shareText + '\n' + shareUrl)}`
    : '#';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          <Dialog.Title className="text-xl font-extrabold">{t('title')}</Dialog.Title>

          {/* Превью объявления: горизонтальная карточка */}
          <div className="mt-4 flex gap-3 overflow-hidden rounded-[12px] border border-border bg-surface-2 p-3">
            <div className="relative h-[72px] w-[96px] shrink-0 overflow-hidden rounded-[8px]">
              <PhotoImg
                src={firstPhoto}
                alt={listing.title}
                fill
                sizes="96px"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-extrabold text-ink">
                {formattedPrice}
              </p>
              {specParts.length > 0 && (
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {specParts.join(' · ')}
                </p>
              )}
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {[listing.district, listing.address].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          {/* Каналы шеринга */}
          <div className="mt-5 grid grid-cols-4 gap-2">
            {/* Копировать ссылку */}
            <button
              type="button"
              onClick={handleCopy}
              className="flex flex-col items-center gap-1.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface shadow-sm transition-colors hover:bg-surface-2">
                <Link2 size={22} strokeWidth={1.8} />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight text-ink-soft">
                {copied ? t('copied') : t('copy')}
              </span>
            </button>

            {/* Telegram */}
            <a
              href={tgHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface shadow-sm transition-colors hover:bg-surface-2">
                <Send size={20} strokeWidth={1.8} />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight text-ink-soft">
                {t('telegram')}
              </span>
            </a>

            {/* WhatsApp */}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface shadow-sm transition-colors hover:bg-surface-2">
                <MessageCircle size={20} strokeWidth={1.8} />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight text-ink-soft">
                {t('whatsapp')}
              </span>
            </a>

            {/* Email */}
            <a
              href={mailHref}
              className="flex flex-col items-center gap-1.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface shadow-sm transition-colors hover:bg-surface-2">
                <Mail size={20} strokeWidth={1.8} />
              </span>
              <span className="text-center text-[11px] font-semibold leading-tight text-ink-soft">
                {t('email')}
              </span>
            </a>
          </div>

          {/* Крестик закрытия */}
          <Dialog.Close
            aria-label={t('close')}
            className="absolute right-4 top-4 text-muted-foreground hover:text-ink"
          >
            ✕
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── ShareButton ───────────────────────────────────────────────────────────────

export function ShareButton({ listing }: ShareButtonProps) {
  const t = useTranslations('share');
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={t('button')}
        onClick={() => setOpen(true)}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-border bg-surface shadow-sm transition-transform duration-150 hover:bg-surface-2 active:scale-90"
      >
        <Share2 size={18} strokeWidth={1.9} />
      </button>

      <ShareModal listing={listing} open={open} onOpenChange={setOpen} />
    </>
  );
}
