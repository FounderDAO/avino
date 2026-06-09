/**
 * LoginModal — заглушка OTP-входа (UI без реальной авторизации).
 * Двухшаговый макет: телефон → код. Реальный flow появится в цикле 3.
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Logo } from './Logo';

export interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Контекст вызова (например «Войдите, чтобы добавить в избранное»). */
  context?: string;
}

export function LoginModal({ open, onOpenChange, context }: LoginModalProps) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const phoneValid = phone.replace(/\D/g, '').length >= 9;

  // Сброс шага при закрытии.
  React.useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

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
              />
              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={!phoneValid}
                onClick={() => setStep(2)}
              >
                Получить код
              </Button>
            </>
          ) : (
            <>
              <Dialog.Title className="mt-[18px] text-[26px]">Введите код</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[14.5px] text-muted-foreground">
                Код отправлен на {phone || 'ваш номер'}.{' '}
                <button
                  type="button"
                  onClick={() => setStep(1)}
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
              />
              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={code.length < 4}
                onClick={() => onOpenChange(false)}
              >
                Подтвердить
              </Button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
