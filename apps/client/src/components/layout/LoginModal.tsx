/**
 * LoginModal — OTP-вход публичного портала (TASK-150).
 * Двухшаговый flow: телефон → код. Подключён к authApi (RTK Query).
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Logo } from './Logo';
import {
  useRequestOtpMutation,
  useVerifyOtpMutation,
} from '@/store/api/authApi';
import { getApiError, getApiErrorCode } from '@/store/api/apiError';

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

/** RU-сообщения для кодов ошибок шага «Подтвердить». */
const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  OTP_INVALID: 'Неверный код. Проверьте и попробуйте ещё раз.',
  OTP_EXPIRED: 'Срок действия кода истёк. Запросите новый.',
  OTP_ATTEMPTS_EXCEEDED: 'Слишком много попыток. Запросите новый код позже.',
  USER_BLOCKED: 'Аккаунт заблокирован. Обратитесь в поддержку.',
};

/** RU-сообщения для кодов ошибок шага «Получить код». */
const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'Слишком часто. Подождите немного перед повтором.',
  OTP_RATE_LIMITED: 'Слишком часто. Подождите немного перед повтором.',
  VALIDATION_ERROR: 'Проверьте корректность номера телефона.',
};

export function LoginModal({ open, onOpenChange, context }: LoginModalProps) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [phone, setPhone] = React.useState('');
  /** E.164 номер, на который реально отправлен код (шаг 1 → шаг 2). */
  const [destination, setDestination] = React.useState('');
  const [code, setCode] = React.useState('');

  const [requestOtp, requestState] = useRequestOtpMutation();
  const [verifyOtp, verifyState] = useVerifyOtpMutation();

  const phoneValid = phone.replace(/\D/g, '').length >= 9;

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
  const requestErrorMessage = requestError
    ? (REQUEST_ERROR_MESSAGES[requestError.code] ??
        requestError.message ??
        'Не удалось отправить код. Попробуйте ещё раз.')
    : null;

  const verifyErrorCode = getApiErrorCode(verifyState.error);
  const verifyError = getApiError(verifyState.error);
  const verifyErrorMessage = verifyError
    ? ((verifyErrorCode && VERIFY_ERROR_MESSAGES[verifyErrorCode]) ??
        verifyError.message ??
        'Не удалось подтвердить код. Попробуйте ещё раз.')
    : null;

  const handleRequest = async () => {
    const dest = toE164Uzbek(phone);
    try {
      await requestOtp({ channel: 'SMS', destination: dest }).unwrap();
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
      await verifyOtp({ channel: 'SMS', destination, code }).unwrap();
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
            aria-label="Закрыть"
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
              <Dialog.Title className="mt-[18px] text-[26px]">Вход в Avino</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[14.5px] text-muted-foreground">
                Введите номер телефона — пришлём код подтверждения по SMS.
              </Dialog.Description>
              <label className="mt-5 block text-[13px] font-bold text-ink">
                Номер телефона
              </label>
              <Field
                className="mt-2"
                placeholder="+998 90 123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phoneValid && !requestState.isLoading) {
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
                disabled={!phoneValid || requestState.isLoading}
                onClick={() => void handleRequest()}
              >
                {requestState.isLoading ? 'Отправляем…' : 'Получить код'}
              </Button>
            </>
          ) : (
            <>
              <Dialog.Title className="mt-[18px] text-[26px]">Введите код</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[14.5px] text-muted-foreground">
                Код отправлен на {destination || 'ваш номер'}.{' '}
                <button
                  type="button"
                  onClick={goToStep1}
                  className="font-bold text-teal"
                >
                  Изменить
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
                {verifyState.isLoading ? 'Проверяем…' : 'Подтвердить'}
              </Button>
              <button
                type="button"
                onClick={() => void handleRequest()}
                disabled={requestState.isLoading}
                className="mt-3 w-full text-[13px] font-semibold text-muted-foreground hover:text-ink disabled:opacity-50"
              >
                {requestState.isLoading ? 'Отправляем…' : 'Отправить код повторно'}
              </button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
