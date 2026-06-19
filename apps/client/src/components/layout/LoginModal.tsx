/**
 * LoginModal — OTP-вход публичного портала (TASK-150).
 * Двухшаговый flow: контакт (телефон ИЛИ email) → код. Подключён к authApi
 * (RTK Query). Канал выбирается переключателем «Телефон / Email» (PRD §auth):
 * phone → SMS, email → EMAIL; шаг подтверждения кода общий для обоих каналов.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Logo } from './Logo';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AppleSignInButton } from './AppleSignInButton';
import {
  useRequestOtpMutation,
  useVerifyOtpMutation,
} from '@/store/api/authApi';
import { getApiError, getApiErrorCode, isNetworkError } from '@/store/api/apiError';

export interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Контекст вызова (например «Войдите, чтобы добавить в избранное»). */
  context?: string;
}

/**
 * Нормализует ввод в E.164 узбекский формат: +998XXXXXXXXX.
 * Стрипаем всё, кроме цифр; гарантируем ведущие 998; префикс «+».
 */
function toE164Uzbek(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('998')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('8') && digits.length === 10) {
    // На случай ввода с местным «8»-префиксом — отбрасываем.
    digits = digits.slice(1);
  }
  return `+998${digits}`;
}

/** Ключи переводов (`auth.errors.*`) для кодов ошибок шага «Подтвердить». */
const VERIFY_ERROR_KEYS: Record<string, string> = {
  OTP_INVALID: 'errors.otpInvalid',
  OTP_EXPIRED: 'errors.otpExpired',
  OTP_ATTEMPTS_EXCEEDED: 'errors.otpAttemptsExceeded',
  USER_BLOCKED: 'errors.userBlocked',
};

/** Ключи переводов (`auth.errors.*`) для кодов ошибок шага «Получить код». */
const REQUEST_ERROR_KEYS: Record<string, string> = {
  RATE_LIMITED: 'errors.rateLimited',
  OTP_RATE_LIMITED: 'errors.rateLimited',
  VALIDATION_ERROR: 'errors.validationError',
};

/** Базовая проверка email на стороне клиента (строгую делает бэкенд). */
function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export function LoginModal({ open, onOpenChange, context }: LoginModalProps) {
  const t = useTranslations('auth');
  const [step, setStep] = React.useState<1 | 2>(1);
  /** Канал входа: телефон (SMS) или email (EMAIL). */
  const [method, setMethod] = React.useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  /** Контакт (E.164 номер или email), на который реально отправлен код (шаг 1 → шаг 2). */
  const [destination, setDestination] = React.useState('');
  const [code, setCode] = React.useState('');

  const [requestOtp, requestState] = useRequestOtpMutation();
  const [verifyOtp, verifyState] = useVerifyOtpMutation();

  const channel = method === 'phone' ? 'SMS' : 'EMAIL';
  const phoneValid = phone.replace(/\D/g, '').length >= 9;
  const inputValid = method === 'phone' ? phoneValid : isValidEmail(email);

  // Сброс состояния при закрытии.
  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setCode('');
      requestState.reset();
      verifyState.reset();
    }
    // requestState/verifyState.reset стабильны между рендерами.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requestError = getApiError(requestState.error);
  let requestErrorKey = requestError ? REQUEST_ERROR_KEYS[requestError.code] : undefined;
  // Сообщение о невалидном контакте зависит от выбранного канала.
  if (requestError?.code === 'VALIDATION_ERROR' && method === 'email') {
    requestErrorKey = 'errors.validationErrorEmail';
  }
  const requestErrorMessage = requestError
    ? requestErrorKey
      ? t(requestErrorKey)
      : (requestError.message ?? t('errors.requestFailed'))
    : isNetworkError(requestState.error)
      ? t('errors.networkError')
      : null;

  const verifyErrorCode = getApiErrorCode(verifyState.error);
  const verifyError = getApiError(verifyState.error);
  const verifyErrorKey = verifyErrorCode ? VERIFY_ERROR_KEYS[verifyErrorCode] : undefined;
  const verifyErrorMessage = verifyError
    ? verifyErrorKey
      ? t(verifyErrorKey)
      : (verifyError.message ?? t('errors.verifyFailed'))
    : isNetworkError(verifyState.error)
      ? t('errors.networkError')
      : null;

  const handleRequest = async () => {
    const dest = method === 'phone' ? toE164Uzbek(phone) : email.trim();
    try {
      await requestOtp({ channel, destination: dest }).unwrap();
      setDestination(dest);
      setCode('');
      verifyState.reset();
      setStep(2);
    } catch {
      /* ошибка показывается через requestErrorMessage */
    }
  };

  const handleVerify = async () => {
    try {
      await verifyOtp({ channel, destination, code }).unwrap();
      // setCredentials выставляется в onQueryStarted хука.
      onOpenChange(false);
    } catch {
      /* ошибка показывается через verifyErrorMessage */
    }
  };

  const goToStep1 = () => {
    setStep(1);
    setCode('');
    verifyState.reset();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-8 shadow-raised">
          <Dialog.Close
            aria-label={t('close')}
            className="absolute right-4 top-4 p-1 text-muted-foreground hover:text-ink"
          >
            <X size={22} />
          </Dialog.Close>

          <Logo />

          {context && (
            <div className="mt-3.5 rounded-[10px] bg-mint px-3.5 py-2.5 text-[13.5px] font-semibold text-teal-deep">
              {context}
            </div>
          )}

          {step === 1 ? (
            <>
              <Dialog.Title className="mt-[18px] text-[26px]">{t('title')}</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[14.5px] text-muted-foreground">
                {method === 'phone' ? t('phoneDescription') : t('emailDescription')}
              </Dialog.Description>

              {/* Переключатель канала входа: телефон (SMS) ↔ email (EMAIL). */}
              <div
                role="tablist"
                aria-label={t('methodLabel')}
                className="mt-5 flex rounded-pill bg-surface-2 p-1"
              >
                {(['phone', 'email'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={method === m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      'flex-1 rounded-pill py-2 text-[13.5px] font-bold transition-colors',
                      method === m
                        ? 'bg-surface text-ink shadow-card'
                        : 'text-muted-foreground hover:text-ink',
                    )}
                  >
                    {m === 'phone' ? t('methodPhone') : t('methodEmail')}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-[13px] font-bold text-ink">
                {method === 'phone' ? t('phoneLabel') : t('emailLabel')}
              </label>
              <Field
                className="mt-2"
                type={method === 'email' ? 'email' : 'text'}
                placeholder={
                  method === 'phone' ? t('phonePlaceholder') : t('emailPlaceholder')
                }
                value={method === 'phone' ? phone : email}
                onChange={(e) =>
                  method === 'phone'
                    ? setPhone(e.target.value)
                    : setEmail(e.target.value)
                }
                inputMode={method === 'phone' ? 'tel' : 'email'}
                autoComplete={method === 'phone' ? 'tel' : 'email'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputValid && !requestState.isLoading) {
                    void handleRequest();
                  }
                }}
              />
              {requestErrorMessage && (
                <p
                  role="alert"
                  className="mt-2 text-[13px] font-semibold text-red"
                >
                  {requestErrorMessage}
                </p>
              )}
              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={!inputValid || requestState.isLoading}
                onClick={() => void handleRequest()}
              >
                {requestState.isLoading ? t('sending') : t('requestCode')}
              </Button>
              <div className="mt-4 flex items-center gap-3 text-[12px] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t('or')}
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleSignInButton onSuccess={() => onOpenChange(false)} />
              <AppleSignInButton
                label={t('continueWithApple')}
                onSuccess={() => onOpenChange(false)}
              />
            </>
          ) : (
            <>
              <Dialog.Title className="mt-[18px] text-[26px]">{t('codeTitle')}</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[14.5px] text-muted-foreground">
                {t('codeSentTo', { destination: destination || t('yourNumber') })}{' '}
                <button
                  type="button"
                  onClick={goToStep1}
                  className="font-bold text-teal"
                >
                  {t('change')}
                </button>
              </Dialog.Description>
              <Field
                className="mt-5 text-center text-[22px] font-bold tracking-[0.4em]"
                placeholder="••••"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.length >= 4 && !verifyState.isLoading) {
                    void handleVerify();
                  }
                }}
              />
              {verifyErrorMessage && (
                <p
                  role="alert"
                  className="mt-2 text-[13px] font-semibold text-red"
                >
                  {verifyErrorMessage}
                </p>
              )}
              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={code.length < 4 || verifyState.isLoading}
                onClick={() => void handleVerify()}
              >
                {verifyState.isLoading ? t('verifying') : t('verify')}
              </Button>
              <button
                type="button"
                onClick={() => void handleRequest()}
                disabled={requestState.isLoading}
                className="mt-3 w-full text-[13px] font-semibold text-muted-foreground hover:text-ink disabled:opacity-50"
              >
                {requestState.isLoading ? t('sending') : t('resendCode')}
              </button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
