"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";

import {
  selectAuthInitialized,
  selectIsAuthenticated,
} from "@/store/slices/authSlice";
import { useGetMeQuery } from "@/store/api/authApi";
import { useLogout } from "@/hooks/useLogout";
import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import { useT } from "@/lib/i18n";

/**
 * RoleGuard (ADMIN-06) — гард доступа к разделам админки.
 *
 * Поток:
 * 1. До гидрации (`hydrated`) и инициализации authSlice — нейтральный экран
 *    загрузки. Это убирает hydration mismatch: на сервере localStorage нет, и
 *    `isAuthenticated` там всегда false, а на клиенте — зависит от refresh-токена.
 * 2. Нет токенов (или их аннулировал упавший refresh в baseQueryWithReauth) →
 *    редирект на `/admin/login`.
 * 3. Есть токен → `GET /auth/me`. Истёкший access восстановит авто-refresh
 *    (ADMIN-04); невалидный refresh приведёт к `logOut` → редирект на логин.
 * 4. Пользователь без роли `ADMIN` → экран 403 «нет доступа».
 * 5. Роль `ADMIN` есть → рендерим защищённое содержимое.
 *
 * Сам гард монтируется только на не-логин маршрутах (см. ConditionalShell),
 * поэтому редирект-петли с `/admin/login` не возникает.
 */

const LOGIN_ROUTE = "/admin/login";

export function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useT();
  const initialized = useSelector(selectAuthInitialized);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  // Гидрация: false на сервере и при первом клиентском рендере, true после mount.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const ready = hydrated && initialized;

  const { data: me, isLoading, isError, refetch } = useGetMeQuery(undefined, {
    skip: !ready || !isAuthenticated,
  });

  // Нет креденшелов → на логин (только после гидрации, иначе SSR-редирект).
  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace(LOGIN_ROUTE);
    }
  }, [ready, isAuthenticated, router]);

  if (!ready) {
    return <StatusScreen>{t("common.loading")}</StatusScreen>;
  }

  if (!isAuthenticated) {
    return <StatusScreen>{t("guard.redirecting")}</StatusScreen>;
  }

  if (isLoading) {
    return <StatusScreen>{t("guard.checkingAccess")}</StatusScreen>;
  }

  if (me) {
    if (me.roles.includes("ADMIN")) {
      return <>{children}</>;
    }
    return <ForbiddenScreen email={me.email} />;
  }

  // getMe упал не по 401 (сеть / 5xx), а токены ещё на месте.
  if (isError) {
    return <ErrorScreen onRetry={() => refetch()} />;
  }

  return <StatusScreen>{t("guard.checkingAccess")}</StatusScreen>;
}

// ─── Экраны состояний ────────────────────────────────────────────────────────

/** Нейтральный полноэкранный статус со спиннером. */
function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500 dark:border-gray-700 dark:border-t-brand-400"
          aria-hidden
        />
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          {children}
        </p>
      </div>
    </div>
  );
}

/** Каркас-обёртка для финальных экранов (403 / ошибка). */
function ScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900">
      <div className="absolute right-4 top-4">
        <ThemeToggleButton />
      </div>
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white">
            A
          </span>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            Avino
          </span>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}

/** 403 — пользователь авторизован, но без роли ADMIN. */
function ForbiddenScreen({ email }: { email: string | null }) {
  const logout = useLogout();
  const { t } = useT();
  return (
    <ScreenShell>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <h1 className="mt-5 text-title-sm font-bold text-gray-900 dark:text-white">
        {t("guard.forbiddenTitle")}
      </h1>
      <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
        {email ? (
          <>
            {t("guard.forbiddenNamedPre")}{" "}
            <span className="font-medium">{email}</span>{" "}
            {t("guard.forbiddenNamedPost")}
          </>
        ) : (
          t("guard.forbiddenAnon")
        )}{" "}
        {t("guard.forbiddenHint")}
      </p>
      <button
        type="button"
        onClick={logout}
        className="mt-6 flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand-500 text-theme-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
      >
        {t("guard.signInAnother")}
      </button>
    </ScreenShell>
  );
}

/** Ошибка загрузки профиля (не 401): сеть / 5xx — даём повторить или выйти. */
function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  const logout = useLogout();
  const { t } = useT();
  return (
    <ScreenShell>
      <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
        {t("guard.errorTitle")}
      </h1>
      <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
        {t("guard.errorBody")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-brand-500 text-theme-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
      >
        {t("common.retry")}
      </button>
      <button
        type="button"
        onClick={logout}
        className="mt-3 flex h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-gray-300 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
      >
        {t("common.signOut")}
      </button>
    </ScreenShell>
  );
}
