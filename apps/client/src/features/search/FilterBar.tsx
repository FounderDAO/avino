'use client';

import { useEffect, useState } from 'react';
import {
  Currency,
  PROPERTY_TYPES,
  PropertyType,
  SUPPORTED_CURRENCIES,
} from '@avino/shared';
import { Button } from '@/components/ui/button';
import type { SearchFilters } from '@/store/api/searchApi';
import { PROPERTY_TYPE_LABELS } from './format';

/**
 * Панель фильтров выдачи (TASK-151). Держит локальный «черновик» и применяет
 * его по сабмиту/сбросу — родитель (`SearchPage`) владеет применёнными
 * фильтрами и сбрасывает keyset-курсор при каждом изменении.
 *
 * `transaction_type` фиксируется страницей (`/sale` | `/rent`) и здесь не
 * редактируется.
 */

/** Подмножество фильтров, редактируемых в баре (без transaction_type/sort). */
export type FilterBarValue = Pick<
  SearchFilters,
  'q' | 'property_type' | 'rooms' | 'price_min' | 'price_max' | 'currency'
>;

interface FilterBarProps {
  value: FilterBarValue;
  onApply: (next: FilterBarValue) => void;
}

const inputCls =
  'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function toNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function FilterBar({ value, onApply }: FilterBarProps) {
  const [draft, setDraft] = useState<FilterBarValue>(value);

  // Синхронизация при внешнем сбросе фильтров.
  useEffect(() => setDraft(value), [value]);

  const patch = (next: Partial<FilterBarValue>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(draft);
  };

  const reset = () => {
    const cleared: FilterBarValue = { currency: draft.currency };
    setDraft(cleared);
    onApply(cleared);
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
    >
      <label className="flex flex-1 basis-48 flex-col gap-1 text-xs text-muted-foreground">
        Поиск
        <input
          type="search"
          className={inputCls}
          placeholder="Заголовок, адрес…"
          value={draft.q ?? ''}
          onChange={(e) => patch({ q: e.target.value })}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Тип
        <select
          className={inputCls}
          value={draft.property_type ?? ''}
          onChange={(e) =>
            patch({
              property_type: (e.target.value || undefined) as
                | PropertyType
                | undefined,
            })
          }
        >
          <option value="">Любой</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROPERTY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-20 flex-col gap-1 text-xs text-muted-foreground">
        Комнат
        <input
          type="number"
          min={0}
          className={inputCls}
          value={draft.rooms ?? ''}
          onChange={(e) => patch({ rooms: toNumber(e.target.value) })}
        />
      </label>

      <label className="flex w-28 flex-col gap-1 text-xs text-muted-foreground">
        Цена от
        <input
          type="number"
          min={0}
          className={inputCls}
          value={draft.price_min ?? ''}
          onChange={(e) => patch({ price_min: toNumber(e.target.value) })}
        />
      </label>

      <label className="flex w-28 flex-col gap-1 text-xs text-muted-foreground">
        Цена до
        <input
          type="number"
          min={0}
          className={inputCls}
          value={draft.price_max ?? ''}
          onChange={(e) => patch({ price_max: toNumber(e.target.value) })}
        />
      </label>

      <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">
        Валюта
        <select
          className={inputCls}
          value={draft.currency ?? Currency.UZS}
          onChange={(e) => patch({ currency: e.target.value as Currency })}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <Button type="submit">Применить</Button>
        <Button type="button" variant="ghost" onClick={reset}>
          Сбросить
        </Button>
      </div>
    </form>
  );
}
