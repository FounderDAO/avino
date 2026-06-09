/**
 * Admin-кнопки — тонкие обёртки над классами .abtn* / .aicon-btn (styles в
 * globals.css, порт styles/admin.css). «Мягкие» кнопки (radius 10), не pill.
 * Для чипов с динамическим фоном можно использовать raw <button className="abtn
 * abtn-sm" style={{...}}> — классы доступны глобально. asChild — для <Link>.
 */
import * as React from 'react';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'ok' | 'danger';
type Size = 'md' | 'sm';

export interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn('abtn', `abtn-${variant}`, size === 'sm' && 'abtn-sm', className)}
        {...props}
      />
    );
  },
);
AdminButton.displayName = 'AdminButton';

/** Квадратная икон-кнопка (.aicon-btn). */
export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button ref={ref} className={cn('aicon-btn', className)} {...props} />
  ),
);
IconButton.displayName = 'IconButton';
