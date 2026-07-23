/**
 * DeleteAccountModal — необратимое удаление аккаунта (soft-delete на бэке).
 * Требует ввод слова-подтверждения. На успехе чистит локальную сессию
 * (clearCredentials → identityResetListener сбрасывает весь RTK-кэш),
 * показывает тост и уводит на «/».
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { useAppDispatch } from '@/store/hooks';
import { clearCredentials } from '@/store/slices/authSlice';
import { useDeleteAccountMutation } from '@/store/api/usersApi';
import { getApiError } from '@/store/api/apiError';

export interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ open, onClose }: DeleteAccountModalProps) {
  const t = useTranslations('account');
  const td = (k: string) => t(`deleteAccount.${k}`);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [deleteAccount, { isLoading }] = useDeleteAccountMutation();

  const [word, setWord] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setWord('');
      setError(null);
    }
  }, [open]);

  const confirmWord = td('confirmWord');
  const canDelete = word.trim().toLowerCase() === confirmWord.trim().toLowerCase() && !isLoading;

  const onConfirm = async () => {
    if (!canDelete) return;
    setError(null);
    try {
      await deleteAccount().unwrap();
      dispatch(clearCredentials());
      toast.success(td('success'));
      router.push('/');
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setError(apiErr?.message ?? td('error'));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          <Dialog.Title className="text-xl font-extrabold text-red">{td('modalTitle')}</Dialog.Title>

          <Dialog.Description className="mt-3 text-[14px] text-foreground">{td('warningIntro')}</Dialog.Description>
          <ul className="mt-2 list-disc pl-5 text-[14px] text-muted-foreground">
            <li>{td('bulletListings')}</li>
            <li>{td('bulletFavorites')}</li>
            <li>{td('bulletChats')}</li>
          </ul>
          <p className="mt-3 rounded-md bg-red/10 p-3 text-[13.5px] font-semibold text-red">
            {td('warningReregister')}
          </p>

          <div className="mt-4">
            <label htmlFor="delete-confirm-word" className="mb-[7px] block text-[13px] font-bold">{td('confirmLabel')}</label>
            <Field
              id="delete-confirm-word"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={td('confirmPlaceholder')}
              autoComplete="off"
            />
          </div>

          {error && <p className="mt-2 text-[13px] font-semibold text-red">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              {td('cancel')}
            </Button>
            <Button type="button" variant="primary" onClick={() => void onConfirm()} disabled={!canDelete}>
              {td('confirmButton')}
            </Button>
          </div>

          <Dialog.Close aria-label={td('cancel')} className="absolute right-4 top-4 text-muted-foreground hover:text-ink">
            ✕
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
