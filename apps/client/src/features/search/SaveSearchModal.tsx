/**
 * SaveSearchModal — модалка именования сохранённого поиска (Zillow-style).
 * Переиспользуется для создания (FilterBar) и переименования (SavedSearches).
 * «Тупой» компонент: create/update-мутацию и toast выполняет родитель через onSubmit.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

export interface SaveSearchModalProps {
  open: boolean;
  mode: 'create' | 'rename';
  initialName: string;
  onSubmit: (name: string) => Promise<void> | void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function SaveSearchModal({
  open,
  mode,
  initialName,
  onSubmit,
  onClose,
  isSubmitting = false,
}: SaveSearchModalProps) {
  const t = useTranslations('saveSearchModal');
  const [name, setName] = React.useState(initialName);

  // Ресинк префилла при повторном открытии/смене элемента.
  React.useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const submit = () => {
    if (!canSubmit) return;
    void onSubmit(trimmed);
  };

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

          <Dialog.Title className="text-[24px]">
            {mode === 'create' ? t('titleCreate') : t('titleRename')}
          </Dialog.Title>

          <label htmlFor="save-search-name" className="mt-5 block text-[13px] font-bold text-ink">
            {t('nameLabel')}
          </label>
          <Field
            id="save-search-name"
            className="mt-2"
            maxLength={150}
            placeholder={t('namePlaceholder')}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />

          <Button size="lg" className="mt-5 w-full" disabled={!canSubmit} onClick={submit}>
            {mode === 'create' ? t('submitCreate') : t('submitRename')}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
