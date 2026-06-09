/**
 * Button — pill-кнопка публичного портала (перенос .btn-* из tokens.css).
 * Варианты: primary (красная), dark (ink), outline, ghost (teal).
 * Размеры: sm / md / lg. Поддерживает `asChild` для оборачивания ссылок.
 */
import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-bold tracking-[-0.01em] transition-[transform,background-color,box-shadow] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-red/35 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-red text-white hover:bg-red-press',
        dark: 'bg-ink text-white hover:bg-black',
        outline: 'border-[1.6px] border-ink bg-surface text-ink hover:bg-surface-2',
        ghost: 'bg-transparent text-teal hover:text-teal-deep',
      },
      size: {
        sm: 'px-4 py-[9px] text-sm',
        md: 'px-[22px] py-[13px] text-[15px]',
        lg: 'px-7 py-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Отрендерить как дочерний элемент (например <Link>) сохранив стили. */
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
