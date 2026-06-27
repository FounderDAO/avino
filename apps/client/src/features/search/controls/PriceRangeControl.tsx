'use client';

import * as React from 'react';
import { Slider as RadixSlider } from 'radix-ui';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { clamp, niceStep, type PriceDomain, type PriceDraft } from './priceRange';
import type { PriceBucket } from '@/store/api/priceDistributionApi';

export interface PriceRangeControlProps {
  domain: PriceDomain;
  buckets: PriceBucket[];
  value: PriceDraft;
  onChange: (v: PriceDraft) => void;
  minLabel: string;
  maxLabel: string;
  fromPlaceholder: string;
  toPlaceholder: string;
  formatLabel: (v: number) => string;
}

export function PriceRangeControl({
  domain,
  buckets,
  value,
  onChange,
  minLabel,
  maxLabel,
  fromPlaceholder,
  toPlaceholder,
  formatLabel,
}: PriceRangeControlProps) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const step = niceStep(domain);

  // Эффективные границы: null отображается как крайнее значение домена
  const lo = value.min ?? domain.min;
  const hi = value.max ?? domain.max;

  return (
    <div className="flex flex-col gap-3">
      {/* Гистограмма: столбик внутри выбранного диапазона — бренд-красный, вне — приглушённый */}
      <div className="flex h-16 items-end gap-px" aria-hidden>
        {buckets.length === 0 ? (
          <div className="h-px w-full self-end bg-border" />
        ) : (
          buckets.map((b, i) => {
            const mid = (b.from + b.to) / 2;
            const inRange = mid >= lo && mid <= hi;
            return (
              <div
                key={i}
                className={cn('min-h-[2px] flex-1 rounded-sm', inRange ? 'bg-primary' : 'bg-primary/25')}
                style={{ height: `${(b.count / maxCount) * 100}%` }}
              />
            );
          })
        )}
      </div>

      {/* Слайдер с двумя ручками поверх базовой линии гистограммы */}
      <RadixSlider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={domain.min}
        max={domain.max}
        step={step}
        value={[value.min ?? domain.min, value.max ?? domain.max]}
        onValueChange={([min, max]) =>
          onChange({
            min: min <= domain.min ? null : min,
            max: max >= domain.max ? null : max,
          })
        }
        minStepsBetweenThumbs={1}
      >
        <RadixSlider.Track className="relative h-1 w-full grow rounded-full bg-border">
          <RadixSlider.Range className="absolute h-full rounded-full bg-primary" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={minLabel}
          className="block h-5 w-5 rounded-full border-2 border-primary bg-surface shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <RadixSlider.Thumb
          aria-label={maxLabel}
          className="block h-5 w-5 rounded-full border-2 border-primary bg-surface shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </RadixSlider.Root>

      {/* Подписи краёв домена ($0 — $1M+) */}
      <div className="flex justify-between text-[13px] font-semibold text-ink">
        <span>{formatLabel(domain.min)}</span>
        <span>{formatLabel(domain.max)}+</span>
      </div>

      {/* Поля Мин/Макс */}
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-bold text-muted-foreground">{minLabel}</span>
          <Field
            inputMode="numeric"
            placeholder={fromPlaceholder}
            value={value.min == null ? '' : String(value.min)}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const next = raw === '' ? null : clamp(Number(raw) || domain.min, domain.min, value.max ?? domain.max);
              onChange({ min: next, max: value.max });
            }}
            className="py-2.5"
          />
        </label>
        <span className="pb-3 text-muted-foreground">–</span>
        <label className="flex-1">
          <span className="mb-1 block text-xs font-bold text-muted-foreground">{maxLabel}</span>
          <Field
            inputMode="numeric"
            placeholder={toPlaceholder}
            value={value.max == null ? '' : String(value.max)}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const next = raw === '' ? null : clamp(Number(raw) || domain.max, value.min ?? domain.min, domain.max);
              onChange({ min: value.min, max: next });
            }}
            className="py-2.5"
          />
        </label>
      </div>
    </div>
  );
}
