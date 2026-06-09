/**
 * Badge — базовый бейдж (перенос .badge из tokens.css).
 * Варианты: new (зелёный), top (красный), gold (VIP-градиент), neutral.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-[5px] rounded-badge px-[9px] py-1 text-[11px] font-extrabold uppercase tracking-[0.02em]',
  {
    variants: {
      variant: {
        new: 'bg-green text-white',
        top: 'bg-red text-white',
        gold: 'bg-gradient-to-br from-[#D9A53C] to-gold text-white shadow-[0_2px_8px_rgba(184,134,42,0.4)]',
        neutral: 'bg-surface-2 text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
