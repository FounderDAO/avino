/**
 * PhoneField — контролируемый инпут телефона с маской «+998 XX XXX XX XX».
 * Код страны «+998» — постоянный нередактируемый префикс внутри рамки поля
 * (виден и в пустом поле, и без фокуса), отделён от номера вертикальной
 * чертой. В самом <input> — только цифры абонента группами «90 123 45 67».
 * Внешний контракт прежний: value/onChange — маскированная строка с «+998 »
 * (или ''); перед отправкой на бэкенд родитель прогоняет её через uzPhoneE164.
 * className уходит на обёртку-рамку (отступы, рестайл рамки/шрифта — инпут
 * наследует шрифт и цвет), ref и остальные пропсы — на <input>.
 * Каретка после реформатирования восстанавливается по числу цифр абонента
 * слева от неё — правка в середине номера не прыгает в конец.
 * Спека: docs/superpowers/specs/2026-07-17-phone-mask-design.md.
 */
'use client';

import * as React from 'react';
import { fieldBoxClass, type FieldProps } from '@/components/ui/field';
import { formatUzPhone, formatUzPhoneLocal, uzPhoneDigits } from '@/lib/phone-mask';
import { cn } from '@/lib/utils';

export interface PhoneFieldProps
  extends Omit<FieldProps, 'value' | 'onChange' | 'type' | 'maxLength' | 'inputMode'> {
  value: string;
  /** Получает маскированную строку («+998 90 123 45 67») или ''. */
  onChange: (masked: string) => void;
}

/** Только цифры строки. */
function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Посимвольный набор/удаление (в отличие от вставки и автозаполнения).
 * Для него эвристики кода страны не нужны и вредны: «99 812 34 56» + лишняя
 * цифра — это переполнение, а не международный номер «998…».
 */
function isTypingInput(e: React.ChangeEvent<HTMLInputElement>): boolean {
  const type = (e.nativeEvent as Partial<InputEvent>).inputType;
  return (
    type === 'insertText' ||
    type === 'insertCompositionText' ||
    (typeof type === 'string' && type.startsWith('delete'))
  );
}

/** Позиция каретки в local («90 123 45 67») сразу после n-й цифры. */
function caretAfterDigits(local: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < local.length; i += 1) {
    if (/\d/.test(local.charAt(i))) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return local.length;
}

export const PhoneField = React.forwardRef<HTMLInputElement, PhoneFieldProps>(
  (
    {
      value,
      onChange,
      onKeyDown,
      autoComplete = 'tel',
      className,
      disabled,
      'aria-describedby': describedBy,
      ...props
    },
    ref,
  ) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);
    const caretRef = React.useRef<number | null>(null);
    const prefixId = React.useId();

    // Ставим каретку после того, как React отрендерил реформатированное value.
    React.useLayoutEffect(() => {
      const el = innerRef.current;
      if (caretRef.current !== null && el && document.activeElement === el) {
        el.setSelectionRange(caretRef.current, caretRef.current);
      }
      caretRef.current = null;
    });

    /** Отдаёт родителю маску из digits и запоминает каретку после digitIdx цифр. */
    const emit = (digits: string, digitIdx: number) => {
      const masked = formatUzPhone(digits);
      caretRef.current = caretAfterDigits(formatUzPhoneLocal(masked), digitIdx);
      onChange(masked);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const el = e.target;
      const pos = el.selectionStart ?? el.value.length;
      if (isTypingInput(e)) {
        // Набор: цифры как есть, лишнее сверх 9 отбрасывается с конца.
        emit(onlyDigits(el.value).slice(0, 9), onlyDigits(el.value.slice(0, pos)).length);
        return;
      }
      // Вставка/автозаполнение: номер может прийти с кодом страны
      // («+998901234567», «998901234567», «8 90 123 45 67») — разбираем эвристиками.
      emit(uzPhoneDigits(el.value), uzPhoneDigits(el.value.slice(0, pos)).length);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || e.key !== 'Backspace') return;
      const el = e.currentTarget;
      const pos = el.selectionStart ?? 0;
      if (el.selectionEnd !== pos) return; // выделение удаляется дефолтно
      if (pos === 0 || /\d/.test(el.value.charAt(pos - 1))) return;
      // Каретка сразу после разделителя: удаляем цифру перед ним вручную
      // (дефолтный Backspace стёр бы только пробел, и реформат вернул бы его).
      let cut = pos - 1;
      while (cut > 0 && !/\d/.test(el.value.charAt(cut - 1))) cut -= 1;
      if (cut === 0) return; // слева нет цифр — удалять нечего
      e.preventDefault();
      emit(
        onlyDigits(el.value.slice(0, cut - 1) + el.value.slice(pos)),
        onlyDigits(el.value.slice(0, cut - 1)).length,
      );
    };

    /** Клик по префиксу/отступам рамки ставит фокус в инпут. */
    const handleBoxMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      const el = innerRef.current;
      if (!el || e.target === el) return; // клик в сам инпут — каретку ставит браузер
      e.preventDefault(); // не снимать фокус, если инпут уже активен
      el.focus();
    };

    return (
      <div
        className={cn(
          fieldBoxClass,
          'flex cursor-text items-center focus-within:border-2 focus-within:border-ink',
          className,
        )}
        onMouseDown={handleBoxMouseDown}
      >
        <span id={prefixId} className="shrink-0 select-none">
          +998
        </span>
        <span aria-hidden="true" className="mx-3 h-5 w-px shrink-0 bg-border" />
        <input
          {...props}
          ref={innerRef}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          disabled={disabled}
          aria-describedby={describedBy ? `${prefixId} ${describedBy}` : prefixId}
          className="w-full min-w-0 flex-1 border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          value={formatUzPhoneLocal(value)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
      </div>
    );
  },
);
PhoneField.displayName = 'PhoneField';
