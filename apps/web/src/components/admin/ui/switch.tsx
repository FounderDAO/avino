/**
 * Admin-переключатель ON/OFF (.a-switch в globals.css). Доступный `role="switch"`
 * поверх нативной <button> (клавиатура/фокус — бесплатно). Включён → бренд-красный,
 * выключен → серый. `disabled` гасит и блокирует (используется на время загрузки/
 * сохранения). Замена красной кнопке «Включено/Выключено» на странице настроек.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  /** Доступное имя (обычно заголовок настройки). */
  label?: string;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onChange, disabled = false, label }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn('a-switch', checked && 'a-switch-on')}
    >
      <span className="a-switch-thumb" />
    </button>
  ),
);
Switch.displayName = 'Switch';
