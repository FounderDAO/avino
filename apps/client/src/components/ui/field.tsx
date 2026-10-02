/**
 * Field — инпут и селект (перенос .field из tokens.css).
 * Общий базовый класс выделен в `fieldClass` для переиспользования.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Рамка поля без состояний самого инпута (focus/placeholder) — для составных
 * полей, где рамку рисует обёртка, а не <input> (см. PhoneField).
 */
export const fieldBoxClass =
  'w-full rounded-input border-[1.5px] border-border bg-surface px-4 py-[13px] text-[15px] font-medium text-ink transition-[border-color,box-shadow] duration-150';

export const fieldClass = `${fieldBoxClass} placeholder:text-muted-foreground focus:border-ink focus:border-2 focus:outline-none`;

export type FieldProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldClass, className)} {...props} />
  ),
);
Field.displayName = 'Field';

export type SelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldClass, 'appearance-none pr-10', className)} {...props}>
      {children}
    </select>
  ),
);
SelectField.displayName = 'SelectField';
