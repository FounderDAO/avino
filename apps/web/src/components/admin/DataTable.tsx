"use client";

// TailAdmin-стилизованная таблица для списков админки (ADMIN-08).
// Управляется контрактом `Column<Row>` (lib/table.ts) — одна реализация на все
// списки (модерация/жалобы/пользователи/логи, ADMIN-08..14). Состояния
// loading/error/empty базовые; единый полиш — ADMIN-16.

import type { ReactNode } from "react";
import type { Column } from "@/lib/table";
import { useT } from "@/lib/i18n";

type DataTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[] | undefined;
  /** Стабильный ключ строки. */
  getRowKey: (row: Row) => string;
  isLoading?: boolean;
  isError?: boolean;
  /** Текст ошибки (если есть осмысленный). */
  errorMessage?: string;
  /** Повторить запрос (refetch). */
  onRetry?: () => void;
  /** Подпись пустого состояния. */
  emptyMessage?: string;
  /** Сколько skeleton-строк показать при загрузке. */
  skeletonRows?: number;
};

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function cellAlign<Row>(col: Column<Row>): string {
  return ALIGN[col.align ?? "left"];
}

function defaultValue<Row>(row: Row, key: string): ReactNode {
  const value = (row as Record<string, unknown>)[key];
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  emptyMessage,
  skeletonRows = 8,
}: DataTableProps<Row>) {
  const { t } = useT();
  const showSkeleton = isLoading && !rows;
  const isEmpty = !isLoading && !isError && rows && rows.length === 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3.5 text-theme-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 ${cellAlign(col)}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {showSkeleton &&
              Array.from({ length: skeletonRows }).map((_, rowIdx) => (
                <tr key={`skeleton-${rowIdx}`}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-4">
                      <div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                    </td>
                  ))}
                </tr>
              ))}

            {!showSkeleton &&
              rows?.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className="transition hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300 ${cellAlign(col)} ${col.className ?? ""}`}
                    >
                      {col.render ? col.render(row) : defaultValue(row, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {isError && (
        <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
          <p className="text-theme-sm text-error-600 dark:text-error-500">
            {errorMessage ?? t("table.loadError")}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {t("common.retry")}
            </button>
          )}
        </div>
      )}

      {isEmpty && (
        <div className="px-5 py-12 text-center text-theme-sm text-gray-500 dark:text-gray-400">
          {emptyMessage ?? t("table.empty")}
        </div>
      )}
    </div>
  );
}
