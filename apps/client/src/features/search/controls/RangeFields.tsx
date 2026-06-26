/**
 * RangeFields — пара числовых инпутов «от / до».
 * Переиспользует Field/fieldClass из компонентной библиотеки.
 * Коммитит значение по onBlur (не на каждый keystroke), чтобы
 * не дёргать URL/стор при каждой цифре.
 */
import * as React from 'react';
import { Field } from '@/components/ui/field';

export interface RangeFieldsProps {
  /** Текущее значение «от» (контролируемая строка). */
  min: string;
  /** Текущее значение «до» (контролируемая строка). */
  max: string;
  /** Коллбэк при изменении «от» (по blur). */
  onMin: (v: string) => void;
  /** Коллбэк при изменении «до» (по blur). */
  onMax: (v: string) => void;
  /** Лейбл/placeholder поля «от». */
  fromLabel: string;
  /** Лейбл/placeholder поля «до». */
  toLabel: string;
  /** Необязательная единица (например «м²»), добавляется к placeholder. */
  suffix?: string;
}

export function RangeFields({
  min,
  max,
  onMin,
  onMax,
  fromLabel,
  toLabel,
  suffix,
}: RangeFieldsProps) {
  const [localMin, setLocalMin] = React.useState(min);
  const [localMax, setLocalMax] = React.useState(max);

  // Реагируем на внешний сброс props (например, при сбросе фильтров)
  React.useEffect(() => setLocalMin(min), [min]);
  React.useEffect(() => setLocalMax(max), [max]);

  const fromPlaceholder = suffix ? `${fromLabel} ${suffix}` : fromLabel;
  const toPlaceholder = suffix ? `${toLabel} ${suffix}` : toLabel;

  return (
    <div className="flex gap-2">
      <Field
        inputMode="numeric"
        aria-label={fromLabel}
        placeholder={fromPlaceholder}
        value={localMin}
        onChange={(e) => setLocalMin(e.target.value)}
        onBlur={() => onMin(localMin.trim())}
        className="py-2.5"
      />
      <Field
        inputMode="numeric"
        aria-label={toLabel}
        placeholder={toPlaceholder}
        value={localMax}
        onChange={(e) => setLocalMax(e.target.value)}
        onBlur={() => onMax(localMax.trim())}
        className="py-2.5"
      />
    </div>
  );
}
