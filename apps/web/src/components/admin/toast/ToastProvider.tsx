"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * ADMIN-16 — единый toast-механизм для уведомлений об успехе/ошибке мутаций.
 *
 * In-house (без сторонней зависимости — в духе вендоринга TailAdmin, ADR-0043):
 * лёгкий React Context с очередью эфемерных уведомлений + авто-дисмисс. Это
 * чистое UI-состояние, поэтому оно живёт в Context, а не в Redux/RTK Query
 * (правило §4 — про API-слой, не про эфемерный UI). Провайдер монтируется в
 * layout группы `(admin)`, viewport — фиксированный top-right поверх диалогов
 * (`z-[100]` > `z-50` модалок). RU-only (i18n — ADMIN-17).
 *
 * Использование:
 *   const toast = useToast();
 *   toast.success("Статус изменён.");
 *   toast.error("Не удалось сохранить.");
 */

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = (counter.current += 1);
      setToasts((prev) => [...prev, { id, variant, message }]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}

// ── Viewport + карточка ─────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success:
    "border-success-500/30 bg-success-50 text-success-600 dark:bg-success-500/[0.12] dark:text-success-500",
  error:
    "border-error-500/30 bg-error-50 text-error-600 dark:bg-error-500/[0.12] dark:text-error-500",
  info: "border-brand-500/30 bg-brand-50 text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400",
};

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  info: "i",
};

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.variant === "error" ? "alert" : "status"}
          aria-live={toast.variant === "error" ? "assertive" : "polite"}
          className={`animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-theme-md ${VARIANT_STYLES[toast.variant]}`}
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/60 text-theme-xs font-bold dark:bg-white/10"
          >
            {VARIANT_ICON[toast.variant]}
          </span>
          <p className="flex-1 text-theme-sm">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Закрыть уведомление"
            className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-theme-sm opacity-60 transition hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
