/**
 * ConfirmDialog — модалка подтверждения действия (замена window.confirm).
 * Тексты передаёт вызывающий (свои ключи словаря), подписи «Отмена»/«Закрыть» —
 * из namespace `common`. Портал через Dialog.Portal (radix-ui) — как
 * LimitReachedModal/SaveSearchModal: `.fade-up` на странице ломает `fixed inset-0`.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const t = useTranslations('common');

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-8 shadow-raised">
          <Dialog.Close
            aria-label={t('close')}
            className="absolute right-4 top-4 p-1 text-muted-foreground hover:text-ink"
          >
            <X size={22} />
          </Dialog.Close>

          <Dialog.Title className="pr-8 text-[24px]">{title}</Dialog.Title>
          <Dialog.Description className="mt-3 text-[14.5px] leading-[1.6] text-muted-foreground">
            {description}
          </Dialog.Description>

          <div className="mt-6 flex flex-col gap-2.5">
            <Button size="lg" className="w-full" onClick={onConfirm}>
              {confirmLabel}
            </Button>
            <Button size="lg" variant="outline" className="w-full" onClick={onClose}>
              {t('cancel')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
