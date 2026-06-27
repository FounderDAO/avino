'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Кнопка-триггер дропдауна (pill в стиле прототипа). */
export const TriggerButton = React.forwardRef<
  HTMLButtonElement,
  { label: string; active?: boolean; icon?: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ label, active, icon, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border-[1.5px] px-4 py-[9px] text-sm font-semibold text-ink transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
      active ? 'border-teal bg-mint' : 'border-border bg-surface hover:border-ink',
    )}
    {...props}
  >
    {icon}
    {label}
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>
));
TriggerButton.displayName = 'TriggerButton';
