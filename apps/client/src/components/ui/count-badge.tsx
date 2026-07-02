/**
 * CountBadge — красный бейдж-счётчик непрочитанного. Возвращает null при
 * count <= 0. Позиционирование задаёт потребитель через className
 * (в шапке — absolute поверх иконки, в кабинете — inline).
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CountBadgeProps {
  count: number;
  /** Порог отображения: больше него → «{max}+». По умолчанию 9. */
  max?: number;
  className?: string;
  'aria-label'?: string;
}

export function CountBadge({ count, max = 9, className, ...rest }: CountBadgeProps) {
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold leading-none text-white',
        className,
      )}
      {...rest}
    >
      {text}
    </span>
  );
}
