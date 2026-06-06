"use client";

import type { ReactNode } from "react";

/**
 * ADMIN-16 — единые состояния страниц/карточек админки.
 *
 * Табличные состояния (loading/error/empty) уже инкапсулированы в `DataTable`
 * (рендерятся внутри контейнера таблицы). Здесь — состояния уровня
 * страницы/детальной карточки, которые раньше дублировались по
 * `listings/[id]`, `users/[id]`, дашборду: skeleton, центрированная карточка
 * ошибки с «Повторить», not-found/info и компактный inline-алерт. RU-only
 * (i18n — ADMIN-17).
 */

/** Скелетон детальной карточки (строки-плейсхолдеры). */
export function DetailSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-5 w-full max-w-md animate-pulse rounded bg-gray-100 dark:bg-gray-800"
        />
      ))}
    </div>
  );
}

/** Центрированная карточка-контейнер для состояний уровня страницы. */
function StateCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
      {children}
    </div>
  );
}

/** Ошибка загрузки уровня страницы + кнопка повтора. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <StateCard>
      <p className="text-theme-sm text-error-600 dark:text-error-500">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-gray-300 px-4 py-2 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Повторить
        </button>
      )}
    </StateCard>
  );
}

/** Нейтральное информационное состояние (not-found / пусто). */
export function InfoState({ message }: { message: string }) {
  return (
    <StateCard>
      <p className="text-theme-sm text-gray-500 dark:text-gray-400">{message}</p>
    </StateCard>
  );
}

/** Компактный inline-алерт (например, баннер ошибки дашборда). */
export function InlineAlert({
  variant = "error",
  children,
}: {
  variant?: "error" | "info";
  children: ReactNode;
}) {
  const styles =
    variant === "error"
      ? "border-error-500/30 bg-error-50 text-error-600 dark:bg-error-500/[0.12] dark:text-error-500"
      : "border-brand-500/30 bg-brand-50 text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400";
  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-theme-sm ${styles}`}
    >
      {children}
    </div>
  );
}
