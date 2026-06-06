"use client";

// Page-based пагинация для админ-списков (ADMIN-08). Считает страницы из
// `meta` (см. lib/table.ts: totalPages/hasNextPage). Общий компонент для
// всех списков админки (ADMIN-08..14).

import type { PageMeta } from "@/store/api/pagination";
import { totalPages } from "@/store/api/pagination";
import { hasNextPage } from "@/lib/table";

type PaginationProps = {
  meta: PageMeta | undefined;
  page: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ meta, page, onPageChange }: PaginationProps) {
  const pages = totalPages(meta);
  const total = meta?.total;
  const canPrev = page > 1;
  const canNext = hasNextPage(meta, page);

  // Нечего листать — не занимаем место.
  if (!canPrev && !canNext) return null;

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-theme-sm text-gray-500 dark:text-gray-400">
        {typeof total === "number"
          ? `Стр. ${page}${pages ? ` из ${pages}` : ""} · всего ${total}`
          : `Стр. ${page}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          className="rounded-lg border border-gray-300 px-3.5 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          ← Назад
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          className="rounded-lg border border-gray-300 px-3.5 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Вперёд →
        </button>
      </div>
    </div>
  );
}
