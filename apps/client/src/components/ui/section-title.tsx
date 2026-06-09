/**
 * SectionTitle — заголовок секции с опциональным действием справа
 * (например ссылка «Смотреть все»).
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SectionTitleProps {
  title: string;
  subtitle?: string;
  /** Контент справа (ссылка/кнопка). */
  action?: React.ReactNode;
  className?: string;
}

export function SectionTitle({ title, subtitle, action, className }: SectionTitleProps) {
  return (
    <div className={cn('mb-5 flex items-end justify-between gap-4', className)}>
      <div>
        <h2 className="text-2xl sm:text-[28px]">{title}</h2>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
