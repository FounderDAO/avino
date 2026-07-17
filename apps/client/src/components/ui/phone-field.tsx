/**
 * PhoneField — контролируемый инпут телефона с маской «+998 XX XXX XX XX»
 * (обёртка над Field). В onChange отдаёт уже маскированную строку; перед
 * отправкой на бэкенд родитель прогоняет её через uzPhoneE164.
 * Каретка после реформатирования восстанавливается по числу цифр абонента
 * слева от неё — правка в середине номера не прыгает в конец.
 * Спека: docs/superpowers/specs/2026-07-17-phone-mask-design.md.
 */
'use client';

import * as React from 'react';
import { Field, type FieldProps } from '@/components/ui/field';
import { formatUzPhone, uzPhoneDigits } from '@/lib/phone-mask';

export interface PhoneFieldProps
  extends Omit<FieldProps, 'value' | 'onChange' | 'type' | 'maxLength' | 'inputMode'> {
  value: string;
  /** Получает маскированную строку («+998 90 123 45 67») или ''. */
  onChange: (masked: string) => void;
}

/** Число цифр абонента в raw строго до позиции pos. */
function userDigitsBefore(raw: string, pos: number): number {
  return uzPhoneDigits(raw.slice(0, pos)).length;
}

/** Позиция каретки в masked сразу после n-й цифры абонента. */
function caretAfterUserDigits(masked: string, n: number): number {
  if (!masked) return 0;
  if (n <= 0) return Math.min(5, masked.length); // сразу после «+998 »
  let seen = 0;
  for (let i = 0; i < masked.length; i += 1) {
    if (/\d/.test(masked.charAt(i))) {
      seen += 1;
      // Первые 3 цифры masked — код страны «998».
      if (seen === n + 3) return i + 1;
    }
  }
  return masked.length;
}

export const PhoneField = React.forwardRef<HTMLInputElement, PhoneFieldProps>(
  ({ value, onChange, onKeyDown, autoComplete = 'tel', ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);
    const caretRef = React.useRef<number | null>(null);

    // Ставим каретку после того, как React отрендерил реформатированное value.
    React.useLayoutEffect(() => {
      const el = innerRef.current;
      if (caretRef.current !== null && el && document.activeElement === el) {
        el.setSelectionRange(caretRef.current, caretRef.current);
      }
      caretRef.current = null;
    });

    /** Реформатирует nextRaw и запоминает каретку после digitIdx цифр. */
    const emit = (nextRaw: string, digitIdx: number) => {
      const masked = formatUzPhone(nextRaw);
      caretRef.current = caretAfterUserDigits(masked, digitIdx);
      onChange(masked);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const el = e.target;
      emit(el.value, userDigitsBefore(el.value, el.selectionStart ?? el.value.length));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || e.key !== 'Backspace') return;
      const el = e.currentTarget;
      const pos = el.selectionStart ?? 0;
      if (el.selectionEnd !== pos) return; // выделение удаляется дефолтно
      const digitIdx = userDigitsBefore(el.value, pos);
      if (pos > 0 && digitIdx === 0) {
        // Слева только фиксированный префикс «+998 » — не трогаем.
        e.preventDefault();
        return;
      }
      if (pos === 0 || /\d/.test(el.value.charAt(pos - 1))) return;
      // Каретка сразу после разделителя: удаляем цифру перед ним вручную
      // (дефолтный Backspace стёр бы только пробел, и реформат вернул бы его).
      e.preventDefault();
      let cut = pos - 1;
      while (cut > 0 && !/\d/.test(el.value.charAt(cut - 1))) cut -= 1;
      emit(el.value.slice(0, cut - 1) + el.value.slice(pos), digitIdx - 1);
    };

    return (
      <Field
        {...props}
        ref={innerRef}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
PhoneField.displayName = 'PhoneField';
