/**
 * ComplaintModal — форма жалобы на объявление (Apple 1.2).
 *
 * Причина (обязательно, один из COMPLAINT_REASONS) + комментарий (обязателен
 * только для OTHER). POST /complaints (Bearer-only — открывается только
 * авторизованным, гостя перехватывает ReportButton через LoginModal).
 * Паттерн модалки — SupportModal/TourRequestModal (radix Dialog).
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  COMPLAINT_REASONS,
  type ComplaintReason,
  useCreateComplaintMutation,
} from '@/store/api/complaintsApi';
import { getApiError } from '@/store/api/apiError';

export interface ComplaintModalProps {
  listingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplaintModal({ listingId, open, onOpenChange }: ComplaintModalProps) {
  const t = useTranslations('complaint');
  const [createComplaint, { isLoading }] = useCreateComplaintMutation();

  const [reason, setReason] = React.useState<ComplaintReason | null>(null);
  const [details, setDetails] = React.useState('');
  const [validationError, setValidationError] = React.useState<string | null>(null);

  // Сбрасываем форму при каждом открытии (иначе повторная жалоба помнит старый выбор).
  const prevOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !prevOpen.current) {
      setReason(null);
      setDetails('');
      setValidationError(null);
    }
    prevOpen.current = open;
  }, [open]);

  const submit = React.useCallback(async () => {
    if (!reason) return;
    if (reason === 'OTHER' && !details.trim()) {
      setValidationError(t('detailsRequired'));
      return;
    }
    setValidationError(null);
    try {
      await createComplaint({
        listing_id: listingId,
        reason,
        details: details.trim() || undefined,
      }).unwrap();
      toast.success(t('success'));
      onOpenChange(false);
      setReason(null);
      setDetails('');
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      toast.error(apiErr?.message ?? t('error'));
    }
  }, [reason, details, createComplaint, listingId, onOpenChange, t]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          <Dialog.Title className="text-xl font-extrabold">{t('modalTitle')}</Dialog.Title>
          <Dialog.Description className="mt-2 text-[14px] text-muted-foreground">
            {t('modalDescription')}
          </Dialog.Description>

          <fieldset className="mt-4 flex flex-col gap-1.5 text-[13px] font-semibold">
            <legend>{t('reasonLabel')}</legend>
            {COMPLAINT_REASONS.map((code) => (
              <label key={code} className="flex items-center gap-2 font-normal">
                <input
                  type="radio"
                  name="complaint-reason"
                  checked={reason === code}
                  onChange={() => setReason(code)}
                />
                {t(`reasons.${code}`)}
              </label>
            ))}
          </fieldset>

          <label className="mt-3 flex flex-col gap-1 text-[13px] font-semibold">
            {t('detailsLabel')}
            <textarea
              aria-label={t('detailsLabel')}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={2000}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal"
            />
          </label>

          {validationError && (
            <p className="mt-2 text-[12.5px] text-red">{validationError}</p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => onOpenChange(false)}
            >
              {t('close')}
            </Button>
            <Button
              type="button"
              disabled={!reason || isLoading}
              onClick={() => void submit()}
            >
              {isLoading ? t('sending') : t('submit')}
            </Button>
          </div>

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
