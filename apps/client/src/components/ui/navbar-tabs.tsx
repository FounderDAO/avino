'use client';

/**
 * NavbarTabs — горизонтальные вкладки-навигация (underline-стиль) с опциональным
 * числовым badge. Управляемый компонент: `value` + `onChange`. Подходит для
 * переключения разделов внутри страницы (напр. типы туров).
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface NavbarTabItem<T extends string> {
  value: T;
  label: string;
  /** Число в badge справа от подписи; ≤0 или отсутствует — badge не рисуется. */
  badge?: number;
}

export interface NavbarTabsProps<T extends string> {
  tabs: NavbarTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function NavbarTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: NavbarTabsProps<T>) {
  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-border', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative -mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              active
                ? 'border-teal text-teal'
                : 'border-transparent text-muted-foreground hover:text-ink',
            )}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="rounded-badge bg-red px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
