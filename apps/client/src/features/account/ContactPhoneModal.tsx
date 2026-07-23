/**
 * ContactPhoneModal — смена ПУБЛИЧНОГО контакт-телефона с OTP-подтверждением.
 * Только SMS. Шаг 1: ввод номера → «Отправить код». Если сервер вернул
 * `applied:true` (номер = верифицированному логин-телефону) — успех сразу, без
 * кода. Иначе шаг 2: ввод кода → «Подтвердить».
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import { PhoneField } from '@/components/ui/phone-field';
import { Button } from '@/components/ui/button';
import { uzPhoneComplete, uzPhoneE164 } from '@/lib/phone-mask';
import {
  useRequestContactPhoneChangeMutation,
  useVerifyContactPhoneChangeMutation,
} from '@/store/api/usersApi';
import { getApiError } from '@/store/api/apiError';

export interface ContactPhoneModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'enter-value' | 'enter-code';

export function ContactPhoneModal({ open, onClose, onSuccess }: ContactPhoneModalProps) {
  const tAccount = useTranslations('account');
  const tc = (key: string, values?: Record<string, string | number | Date>) =>
    tAccount(`contactChange.${key}`, values);
  const tp = (key: string) => tAccount(`contactPhone.${key}`);

  const [requestChange, requestState] = useRequestContactPhoneChangeMutation();
  const [verifyChange, verifyState] = useVerifyContactPhoneChangeMutation();

  const [step, setStep] = React.useState<Step>('enter-value');
  const [value, setValue] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    setStep('enter-value');
    setValue('');
    setDestination('');
    setCode('');
    setError(null);
    setResendSeconds(0);
  }, [open]);

  React.useEffect(() => {
    if (step !== 'enter-code') return;
    const id = setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const pending = requestState.isLoading || verifyState.isLoading;

  const onSendCode = async () => {
    setError(null);
    const dest = uzPhoneE164(value);
    if (!uzPhoneComplete(value) || !dest) {
      setError(tc('invalidValue'));
      return;
    }
    try {
      const res = await requestChange({ destination: dest }).unwrap();
      if (res.applied) {
        onSuccess();
        return;
      }
      setDestination(dest);
      setResendSeconds(res.resend_after);
      setStep('enter-code');
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setError(apiErr?.message ?? tc('invalidValue'));
    }
  };

  const onResend = async () => {
    setError(null);
    try {
      const res = await requestChange({ destination }).unwrap();
      if (!res.applied) setResendSeconds(res.resend_after);
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setError(apiErr?.message ?? tc('invalidValue'));
    }
  };

  const onConfirm = async () => {
    setError(null);
    try {
      await verifyChange({ destination, code }).unwrap();
      onSuccess();
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      if (apiErr?.code === 'OTP_INVALID') setError(tc('errCode'));
      else if (apiErr?.code === 'OTP_EXPIRED') setError(tc('errExpired'));
      else if (apiErr?.code === 'OTP_ATTEMPTS_EXCEEDED') setError(tc('errAttempts'));
      else setError(apiErr?.message ?? tc('errCode'));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          <Dialog.Title className="text-xl font-extrabold">{tp('modalTitle')}</Dialog.Title>

          {step === 'enter-value' ? (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="mb-[7px] block text-[13px] font-bold">{tc('newValue')}</label>
                <PhoneField value={value} onChange={setValue} placeholder="+998 90 123 45 67" />
              </div>
              {error && <p className="text-[13px] font-semibold text-red">{error}</p>}
              <Button type="button" className="self-start" onClick={() => void onSendCode()} disabled={pending}>
                {tc('sendCode')}
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="contact-phone-code" className="mb-[7px] block text-[13px] font-bold">
                  {tc('codeLabel')}
                </label>
                <Field
                  id="contact-phone-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
              {error && <p className="text-[13px] font-semibold text-red">{error}</p>}
              <div className="flex items-center gap-3">
                <Button type="button" onClick={() => void onConfirm()} disabled={pending}>
                  {tc('confirm')}
                </Button>
                <Button type="button" variant="outline" onClick={() => void onResend()} disabled={pending || resendSeconds > 0}>
                  {resendSeconds > 0 ? tc('resendIn', { seconds: resendSeconds }) : tc('resend')}
                </Button>
              </div>
            </div>
          )}

          <Dialog.Close aria-label={tc('close')} className="absolute right-4 top-4 text-muted-foreground hover:text-ink">
            ✕
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
