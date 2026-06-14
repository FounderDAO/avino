/**
 * Segment — сегмент-переключатель (перенос .segment из tokens.css).
 * Generic по значению опции. Управляемый компонент (value + onChange).
 */
'use client';

import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentProps<T>) {
  return (
    <div className={cn('inline-flex gap-[2px] rounded-pill bg-segment-track p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-pill px-[18px] py-[9px] text-sm font-bold transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              active
                ? 'bg-surface text-ink shadow-[0_1px_4px_rgba(40,34,24,0.12)]'
                : 'bg-transparent text-muted-foreground hover:text-ink',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
