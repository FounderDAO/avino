/**
 * ContactChangeModal — смена логин-контакта (телефон/email) с подтверждением
 * OTP-кодом на НОВОЕ значение. Два шага: (1) ввод нового значения → «Отправить
 * код»; (2) ввод кода + таймер повторной отправки → «Подтвердить».
 * `destination` из шага 1 хранится и переиспользуется в verify — сервер
 * требует то же значение, которым был запрошен код.
 * Успешный verify → onSuccess() (родитель тостит; инвалидация 'Auth'/'User'
 * в usersApi уже обеспечивает рефетч /auth/me).
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
  useRequestContactChangeMutation,
  useVerifyContactChangeMutation,
  type ContactChannel,
} from '@/store/api/usersApi';
import { getApiError } from '@/store/api/apiError';

export interface ContactChangeModalProps {
  channel: ContactChannel;
  open: boolean;
  onClose: () => void;
  /** Родитель тостит успех; рефетч /auth/me обеспечен инвалидацией тегов. */
  onSuccess: () => void;
}

type Step = 'enter-value' | 'enter-code';

/** Минимальная клиентская проверка email — сервер всё равно валидирует строго. */
function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function ContactChangeModal({ channel, open, onClose, onSuccess }: ContactChangeModalProps) {
  const tAccount = useTranslations('account');
  const t = (key: string, values?: Record<string, string | number | Date>) =>
    tAccount(`contactChange.${key}`, values);
  const [requestContactChange, requestState] = useRequestContactChangeMutation();
  const [verifyContactChange, verifyState] = useVerifyContactChangeMutation();

  const [step, setStep] = React.useState<Step>('enter-value');
  const [value, setValue] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = React.useState(0);

  // Сброс состояния при каждом открытии модалки.
  React.useEffect(() => {
    if (!open) return;
    setStep('enter-value');
    setValue('');
    setDestination('');
    setCode('');
    setError(null);
    setResendSeconds(0);
  }, [open]);

  // Обратный отсчёт до разрешённого повтора — тикает, пока мы на шаге кода.
  React.useEffect(() => {
    if (step !== 'enter-code') return;
    const id = setInterval(() => {
      setResendSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const pending = requestState.isLoading || verifyState.isLoading;

  const applyRequestError = (err: unknown) => {
    const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
    if (apiErr?.code === 'CONTACT_TAKEN') {
      setError(t('errTaken'));
    } else {
      setError(apiErr?.message ?? t('invalidValue'));
    }
  };

  const onSendCode = async () => {
    setError(null);
    const dest = channel === 'SMS' ? uzPhoneE164(value) : value.trim();
    const valid = channel === 'SMS' ? uzPhoneComplete(value) : isValidEmail(value);
    if (!valid || !dest) {
      setError(t('invalidValue'));
      return;
    }
    try {
      const res = await requestContactChange({ channel, destination: dest }).unwrap();
      setDestination(dest);
      setResendSeconds(res.resend_after);
      setStep('enter-code');
    } catch (err) {
      applyRequestError(err);
    }
  };

  const onResend = async () => {
    setError(null);
    try {
      const res = await requestContactChange({ channel, destination }).unwrap();
      setResendSeconds(res.resend_after);
    } catch (err) {
      applyRequestError(err);
    }
  };

  const onConfirm = async () => {
    setError(null);
    try {
      await verifyContactChange({ channel, destination, code }).unwrap();
      onSuccess();
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      if (apiErr?.code === 'OTP_INVALID') {
        setError(t('errCode'));
      } else if (apiErr?.code === 'OTP_EXPIRED') {
        setError(t('errExpired'));
      } else if (apiErr?.code === 'OTP_ATTEMPTS_EXCEEDED') {
        setError(t('errAttempts'));
      } else {
        setError(apiErr?.message ?? t('errCode'));
      }
    }
  };

  const title = channel === 'SMS' ? t('titlePhone') : t('titleEmail');

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          <Dialog.Title className="text-xl font-extrabold">{title}</Dialog.Title>

          {step === 'enter-value' ? (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="mb-[7px] block text-[13px] font-bold">{t('newValue')}</label>
                {channel === 'SMS' ? (
                  <PhoneField value={value} onChange={setValue} placeholder="+998 90 123 45 67" />
                ) : (
                  <Field
                    type="email"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="you@mail.uz"
                  />
                )}
              </div>

              {error && <p className="text-[13px] font-semibold text-red">{error}</p>}

              <Button
                type="button"
                className="self-start"
                onClick={() => void onSendCode()}
                disabled={pending}
              >
                {t('sendCode')}
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="contact-change-code" className="mb-[7px] block text-[13px] font-bold">
                  {t('codeLabel')}
                </label>
                <Field
                  id="contact-change-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>

              {error && <p className="text-[13px] font-semibold text-red">{error}</p>}

              <div className="flex items-center gap-3">
                <Button type="button" onClick={() => void onConfirm()} disabled={pending}>
                  {t('confirm')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onResend()}
                  disabled={pending || resendSeconds > 0}
                >
                  {resendSeconds > 0 ? t('resendIn', { seconds: resendSeconds }) : t('resend')}
                </Button>
              </div>
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
