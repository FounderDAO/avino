/** Карточка/панель админки (.a-card). Прокидывает className/style/onClick. */
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('a-card', className)} {...props} />
  ),
);
Card.displayName = 'Card';
