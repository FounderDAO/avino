/**
 * SupportModal — форма обращения в поддержку со страницы «Помощь».
 *
 * Поля: имя (опц.), контакт (телефон/email, обяз.), сообщение (обяз.).
 * POST /support/requests (гостю доступно без входа); после успеха — экран
 * «Спасибо» и автозакрытие. Авторизованному контакт предзаполняется телефоном
 * профиля. Паттерн модалки — TourRequestModal (radix Dialog).
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/slices/authSlice';
import { useCreateSupportRequestMutation } from '@/store/api/supportApi';
import { getApiError } from '@/store/api/apiError';

export interface SupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportModal({ open, onOpenChange }: SupportModalProps) {
  const t = useTranslations('help.contact');
  const user = useAppSelector(selectCurrentUser);
  const [createRequest, { isLoading }] = useCreateSupportRequestMutation();

  const [name, setName] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Сбрасываем форму при каждом открытии; контакт — из профиля, если есть.
  const prevOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !prevOpen.current) {
      setName(user?.profile?.display_name ?? user?.profile?.first_name ?? '');
      setContact(user?.profile?.contact_phone ?? user?.phone ?? user?.email ?? '');
      setMessage('');
      setError(null);
      setDone(false);
    }
    prevOpen.current = open;
  }, [open, user]);

  const submit = React.useCallback(async () => {
    setError(null);
    if (!contact.trim()) { setError(t('contactRequired')); return; }
    if (!message.trim()) { setError(t('messageRequired')); return; }
    try {
      await createRequest({
        name: name.trim() || undefined,
        contact: contact.trim(),
        message: message.trim(),
      }).unwrap();
      setDone(true);
      closeTimer.current = setTimeout(() => onOpenChange(false), 1600);
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setError(apiErr?.message ?? t('error'));
    }
  }, [contact, message, name, createRequest, onOpenChange, t]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          <Dialog.Title className="text-xl font-extrabold">{t('modalTitle')}</Dialog.Title>

          {done ? (
            <p className="mt-4 text-base font-semibold text-teal-deep">{t('success')}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('nameLabel')}
                <input
                  aria-label={t('nameLabel')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal"
                />
              </label>

              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('contactLabel')} *
                <input
                  aria-label={t('contactLabel')}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  maxLength={160}
                  placeholder={t('contactPlaceholder')}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal"
                />
              </label>

              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('messageLabel')} *
                <textarea
                  aria-label={t('messageLabel')}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal"
                />
              </label>

              {error && <div className="text-[12.5px] text-red">{error}</div>}

              <Button type="button" size="lg" className="w-full" disabled={isLoading} onClick={submit}>
                {t('submit')}
              </Button>
            </div>
          )}

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
