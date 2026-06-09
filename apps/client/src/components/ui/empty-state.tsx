/**
 * EmptyState — пустое состояние (перенос EmptyState из ui.jsx).
 * Иконка в мятном круге + заголовок + текст + опциональное действие.
 */
import * as React from 'react';
import { Search, type LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  /** Иконка (lucide). По умолчанию — Search. */
  icon?: LucideIcon;
  title: string;
  text?: string;
  /** Действие (обычно кнопка). */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Search,
  title,
  text,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={
        'flex flex-col items-center justify-center gap-1.5 px-6 py-16 text-center ' +
        (className ?? '')
      }
    >
      <div className="mb-2 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-mint text-teal">
        <Icon size={32} strokeWidth={1.8} />
      </div>
      <h3 className="text-[22px]">{title}</h3>
      {text && <p className="my-0.5 mb-3 max-w-[380px] text-muted-foreground">{text}</p>}
      {action}
    </div>
  );
}
