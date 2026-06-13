'use client';

/**
 * SearchAutocomplete — инпут поиска /search с выпадающими подсказками.
 * Презентационный: items/loading и колбэки приходят из FilterBar (хук
 * useGeoSuggest живёт там). Здесь — разметка попапа, группы, ARIA combobox и
 * навигация с клавиатуры. Выбор опции — по mousedown (preventDefault), чтобы не
 * ловить blur раньше клика.
 */
import * as React from 'react';
import { Search } from 'lucide-react';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import type { Suggestion } from './useGeoSuggest';

const MIN_CHARS = 2;

export interface SearchAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: Suggestion) => void;
  onSubmitRaw: (text: string) => void;
  /** Сообщает родителю фокус (включает useGeoSuggest). */
  onActiveChange: (active: boolean) => void;
  items: Suggestion[];
  loading: boolean;
  placeholder: string;
  ariaLabel: string;
  labels: { districts: string; addresses: string; empty: string };
}

export function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  onSubmitRaw,
  onActiveChange,
  items,
  loading,
  placeholder,
  ariaLabel,
  labels,
}: SearchAutocompleteProps) {
  const [focused, setFocused] = React.useState(false);
  const [active, setActive] = React.useState(-1);

  const open = focused && value.trim().length >= MIN_CHARS;

  // Сброс подсветки при смене набора подсказок.
  React.useEffect(() => setActive(-1), [items]);

  const firstDistrict = items.findIndex((i) => i.kind === 'district');
  const firstGeo = items.findIndex((i) => i.kind === 'geo');

  const choose = (s: Suggestion) => {
    onSelect(s);
    setFocused(false);
    onActiveChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter') onSubmitRaw(value);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && active < items.length) choose(items[active]);
      else onSubmitRaw(value);
    } else if (e.key === 'Escape') {
      setFocused(false);
      onActiveChange(false);
    }
  };

  return (
    <div className="relative min-w-[230px] flex-shrink-0">
      <Search
        size={17}
        strokeWidth={1.9}
        className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Field
        role="combobox"
        aria-expanded={open}
        aria-controls="search-suggest-list"
        aria-activedescendant={active >= 0 ? `search-suggest-opt-${active}` : undefined}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          setFocused(true);
          onActiveChange(true);
        }}
        onBlur={() => {
          setFocused(false);
          onActiveChange(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="rounded-pill py-[9px] pl-[38px] pr-4"
        aria-label={ariaLabel}
      />

      {open && (
        <ul
          id="search-suggest-list"
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-[320px] w-[320px] overflow-y-auto rounded-2xl border border-border bg-surface py-2 shadow-lg"
        >
          {items.length === 0 && !loading && (
            <li role="presentation" className="px-4 py-2 text-sm text-muted-foreground">{labels.empty}</li>
          )}
          {items.map((it, idx) => (
            <React.Fragment key={`${it.kind}-${it.title}`}>
              {idx === firstDistrict && (
                <li role="presentation" className="px-4 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {labels.districts}
                </li>
              )}
              {idx === firstGeo && (
                <li role="presentation" className="px-4 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {labels.addresses}
                </li>
              )}
              <li
                id={`search-suggest-opt-${idx}`}
                role="option"
                aria-selected={active === idx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(it);
                }}
                className={cn(
                  'cursor-pointer px-4 py-2 text-sm',
                  active === idx ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                {it.title}
              </li>
            </React.Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
