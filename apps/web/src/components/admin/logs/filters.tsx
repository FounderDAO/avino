"use client";

// Общие фильтр-примитивы журналов админки (ADMIN-14). Четыре вкладки логов
// делят одни и те же контролы (select по enum + текстовый фильтр по UUID) и
// дебаунс текстового ввода — держим их здесь, чтобы не дублировать в каждой
// вкладке. Визуально совпадают с фильтрами модерации/жалоб (ADMIN-08/10).

import { useEffect, useState } from "react";
import type { SelectOption } from "@/lib/table";

const SELECT_CLASS =
  "h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-theme-sm text-gray-900 shadow-theme-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white dark:[&>option]:bg-gray-900";
const INPUT_CLASS =
  "h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-theme-sm text-gray-900 shadow-theme-xs outline-none transition placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white";

/** Дебаунс значения (для текстовых фильтров по id). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Стилизованный select-фильтр (TailAdmin). */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={SELECT_CLASS}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Текстовый фильтр (по UUID сущности/актора). */
export function TextFilter({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </label>
  );
}

/** Обёртка-сетка для строки фильтров вкладки. */
export function FilterGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}

/** Опции селекта с ведущим «все» из карты «значение → подпись». */
export function filterOptions<T extends string>(
  labels: Record<T, string>,
  allLabel: string,
): SelectOption<T | "">[] {
  return [
    { value: "", label: allLabel },
    ...(Object.keys(labels) as T[]).map((value) => ({
      value,
      label: labels[value],
    })),
  ];
}
