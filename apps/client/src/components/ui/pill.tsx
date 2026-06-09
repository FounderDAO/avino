/**
 * Pill / Chip — фильтр-чип (перенос .chip из tokens.css).
 * active=true → тёмная заливка (ink). Рендерится как <button>.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(
  ({ className, active = false, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center gap-[7px] rounded-pill border-[1.5px] px-4 py-[9px] text-sm font-semibold transition-all duration-150',
        active
          ? 'border-ink bg-ink text-white'
          : 'border-border bg-surface text-ink hover:border-ink',
        className,
      )}
      {...props}
    />
  ),
);
Pill.displayName = 'Pill';

/** Алиас Chip — то же, что Pill (по семантике прототипа). */
export const Chip = Pill;
