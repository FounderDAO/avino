import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../api/authApi';

/**
 * authSlice (ADMIN-04, ADR-0153) — хранилище аутентификации админки.
 *
 * Стратегия хранения токенов:
 * - access  — только в памяти (этот slice). В localStorage не пишется.
 * - refresh — БОЛЬШЕ НЕ В JS (ADR-0153, TASK-256 PR-3). Живёт в httpOnly cookie
 *   `avino_rt`, недоступной скрипту. Сервер сам ротирует его по cookie на
 *   `/auth/refresh`.
 *
 * Следствие: при загрузке JS не знает синхронно, есть ли сессия (cookie не
 * видна). `status` стартует с `idle` = «проверяем»: AdminSessionBootstrap делает
 * пробный silent-refresh и переводит в `authenticated` (cookie валидна) либо
 * `unauthenticated` (гость). RoleGuard ждёт разрешения (`resolved`), прежде чем
 * редиректить на /admin/login.
 */

/** Легаси-ключ localStorage — refresh больше не в JS, вычищаем при старте. */
const LEGACY_REFRESH_TOKEN_KEY = 'avino.admin.refresh_token';

function clearLegacyRefreshToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  } catch {
    /* приватный режим / отключённый storage — игнорируем */
  }
}

/**
 * status:
 * - `idle` — сессия ещё не определена (пробный silent-refresh не завершён);
 * - `authenticated` — есть access-токен (silent-refresh или логин удались);
 * - `unauthenticated` — гость (silent-refresh дал 401) либо после логаута.
 */
export type AuthStatus = 'idle' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  /** Access-токен — только в памяти. */
  accessToken: string | null;
  /** Текущий пользователь (из verify). */
  user: AuthUser | null;
  status: AuthStatus;
}

/**
 * initialState одинаков на сервере и клиенте (никакого чтения window) — нет
 * рассинхрона гидрации. refresh из JS не читается (он в cookie); легаси-ключ
 * localStorage вычищается при создании store.
 */
function buildInitialState(): AuthState {
  clearLegacyRefreshToken();
  return { accessToken: null, user: null, status: 'idle' };
}

const authSlice = createSlice({
  name: 'auth',
  initialState: buildInitialState,
  reducers: {
    /** Полные креды после успешного verifyOtp (access + user; refresh в cookie). */
    setCredentials(
      state,
      action: PayloadAction<{ access_token: string; user?: AuthUser }>,
    ) {
      state.accessToken = action.payload.access_token;
      if (action.payload.user) {
        state.user = action.payload.user;
      }
      state.status = 'authenticated';
    },

    /** Ротация после /auth/refresh или бутстрапа (только access; без user). */
    setTokens(state, action: PayloadAction<{ access_token: string }>) {
      state.accessToken = action.payload.access_token;
      state.status = 'authenticated';
    },

    /** Гость / разлогин: сессии нет. Чистим память; cookie гасит сервер. */
    logOut(state) {
      state.accessToken = null;
      state.user = null;
      state.status = 'unauthenticated';
    },
  },
});

export const { setCredentials, setTokens, logOut } = authSlice.actions;

export const authReducer = authSlice.reducer;

// ─── Селекторы ──────────────────────────────────────────────────────────────
// Типизированы по минимальной форме { auth }, чтобы избежать цикла импорта
// с store.ts. RootState ей удовлетворяет, поэтому useSelector работает.

type AuthSliceRoot = { auth: AuthState };

export const selectAccessToken = (s: AuthSliceRoot) => s.auth.accessToken;
export const selectCurrentUser = (s: AuthSliceRoot) => s.auth.user;
export const selectAuthStatus = (s: AuthSliceRoot) => s.auth.status;
export const selectIsAuthenticated = (s: AuthSliceRoot) =>
  Boolean(s.auth.accessToken);
/**
 * Сессия определена (пробный silent-refresh завершён). RoleGuard ждёт resolved,
 * иначе во время `idle`-окна редиректнул бы на /admin/login админа с валидной
 * cookie-сессией, ещё не подтверждённой.
 */
export const selectAuthResolved = (s: AuthSliceRoot) => s.auth.status !== 'idle';
