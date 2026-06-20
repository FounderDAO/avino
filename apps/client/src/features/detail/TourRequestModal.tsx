'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/slices/authSlice';
import { useCreateTourRequestMutation } from '@/store/api/tourRequestsApi';
import { getApiError } from '@/store/api/apiError';
import type { Listing } from '@/lib/mock/types';

export interface TourRequestModalProps {
  listing: Listing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function horizonISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TourRequestModal({ listing, open, onOpenChange }: TourRequestModalProps) {
  const t = useTranslations('tourRequest');
  const user = useAppSelector(selectCurrentUser);
  const [createTour, { isLoading }] = useCreateTourRequestMutation();

  const windows = listing.tourWindows ?? [];

  const initialName = user?.profile?.display_name ?? user?.profile?.first_name ?? '';
  const initialPhone = user?.profile?.contact_phone ?? user?.phone ?? '';

  const [name, setName] = React.useState(initialName);
  const [phone, setPhone] = React.useState(initialPhone);
  const [date, setDate] = React.useState('');
  const [windowIdx, setWindowIdx] = React.useState(0);
  const [message, setMessage] = React.useState(t('messageDefault'));
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  // Сбрасываем форму при каждом открытии модалки.
  const prevOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !prevOpen.current) {
      setName(user?.profile?.display_name ?? user?.profile?.first_name ?? '');
      setPhone(user?.profile?.contact_phone ?? user?.phone ?? '');
      setDate('');
      setWindowIdx(0);
      setMessage(t('messageDefault'));
      setError(null);
      setDone(false);
    }
    prevOpen.current = open;
  }, [open, user, t]);

  const submit = React.useCallback(async () => {
    setError(null);
    if (!phone.trim()) { setError(t('phoneRequired')); return; }
    const w = windows[windowIdx];
    if (!w) { setError(t('windowRequired')); return; }
    if (!date) { setError(t('windowRequired')); return; }
    try {
      await createTour({
        listing_id: listing.id,
        requested_date: date,
        window_start: w.start,
        window_end: w.end,
        requester_name: name.trim(),
        requester_phone: phone.trim(),
        message: message.trim() || undefined,
      }).unwrap();
      setDone(true);
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setError(apiErr?.message ?? t('error'));
    }
  }, [phone, windows, windowIdx, date, createTour, listing.id, name, message, onOpenChange, t]);

  const email = user?.email ?? '';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          <Dialog.Title className="text-xl font-extrabold">{t('title')}</Dialog.Title>

          {done ? (
            <p className="mt-4 text-base font-semibold text-teal-deep">{t('success')}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('name')}
                <input
                  aria-label={t('name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal"
                />
              </label>

              <div className="text-[13px] font-semibold">
                {t('email')}
                <div className="mt-1 text-[15px] font-normal text-muted-foreground">{email}</div>
              </div>

              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('phone')} *
                <input
                  aria-label={t('phone')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="+998 ..."
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal"
                />
              </label>

              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('date')} *
                <input
                  aria-label={t('date')}
                  type="date"
                  value={date}
                  min={todayISO()}
                  max={horizonISO(30)}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal"
                />
              </label>

              <fieldset className="flex flex-col gap-1.5 text-[13px] font-semibold">
                <legend>{t('window')} *</legend>
                {windows.map((w, i) => (
                  <label key={`${w.start}-${w.end}`} className="flex items-center gap-2 font-normal">
                    <input
                      type="radio"
                      name="tour-window"
                      checked={windowIdx === i}
                      onChange={() => setWindowIdx(i)}
                    />
                    {w.start}–{w.end}
                  </label>
                ))}
              </fieldset>

              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('message')}
                <textarea
                  aria-label={t('message')}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal"
                />
              </label>

              {error && <div className="text-[12.5px] text-red">{error}</div>}
              <p className="text-[12px] text-muted-foreground">{t('terms')}</p>

              <Button size="lg" className="w-full" disabled={isLoading} onClick={submit}>
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
