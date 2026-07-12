import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser, MeResponse } from '../api/authApi';

/**
 * authSlice — хранилище аутентификации публичного портала (TASK-150).
 *
 * Стратегия хранения токенов:
 * - access + refresh зеркалятся в localStorage (переживают перезагрузку),
 *   состояние гидрируется из storage лениво в initialState — но только в
 *   браузере (SSR-guard: на сервере window отсутствует, initialState пуст,
 *   чтобы не было рассинхрона при гидрации Next.js).
 *
 * `user` хранит полный MeResponse (из GET /auth/me) либо краткую форму
 * AuthUser (из verifyOtp) — обе совместимы по общему набору полей.
 */

const ACCESS_TOKEN_KEY = 'avino.client.access_token';
const REFRESH_TOKEN_KEY = 'avino.client.refresh_token';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readStored(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function persist(key: string, value: string | null): void {
  if (!isBrowser()) return;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* приватный режим / отключённый storage — игнорируем */
  }
}

export type AuthStatus = 'idle' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  /** Текущий пользователь (из verify / me). */
  user: MeResponse | null;
  status: AuthStatus;
}

/**
 * Ленивый initialState: localStorage читается при СОЗДАНИИ store, а не при
 * загрузке модуля. Смена локали ремонтирует [locale]/layout → StoreProvider
 * создаёт новый store; module-scope снапшот терял бы логин, полученный после
 * загрузки страницы (модалка входа возвращалась бы уже залогиненному).
 */
function buildInitialState(): AuthState {
  const hydratedAccess = readStored(ACCESS_TOKEN_KEY);
  const hydratedRefresh = readStored(REFRESH_TOKEN_KEY);
  return {
    accessToken: hydratedAccess,
    refreshToken: hydratedRefresh,
    user: null,
    status: hydratedRefresh ? 'authenticated' : 'idle',
  };
}

const authSlice = createSlice({
  name: 'auth',
  initialState: buildInitialState,
  reducers: {
    /**
     * Полная/частичная установка кредов. Используется и verifyOtp
     * (access + refresh + user), и refresh-ротацией (только токены).
     */
    setCredentials(
      state,
      action: PayloadAction<{
        access_token: string;
        refresh_token: string;
        user?: AuthUser | MeResponse | null;
      }>,
    ) {
      state.accessToken = action.payload.access_token;
      state.refreshToken = action.payload.refresh_token;
      if (action.payload.user !== undefined) {
        state.user = (action.payload.user as MeResponse) ?? null;
      }
      state.status = 'authenticated';
      persist(ACCESS_TOKEN_KEY, action.payload.access_token);
      persist(REFRESH_TOKEN_KEY, action.payload.refresh_token);
    },

    /** Обновление текущего пользователя (из GET /auth/me). */
    setUser(state, action: PayloadAction<MeResponse | null>) {
      state.user = action.payload;
    },

    /** Разлогин — чистим память и localStorage. */
    clearCredentials(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      state.status = 'unauthenticated';
      persist(ACCESS_TOKEN_KEY, null);
      persist(REFRESH_TOKEN_KEY, null);
    },
  },
});

export const { setCredentials, setUser, clearCredentials } = authSlice.actions;

export const authReducer = authSlice.reducer;

// ─── Селекторы ──────────────────────────────────────────────────────────────
// Типизированы по минимальной форме { auth }, чтобы избежать цикла импорта
// с store.ts. RootState ей удовлетворяет, поэтому useSelector работает.

type AuthSliceRoot = { auth: AuthState };

export const selectAccessToken = (s: AuthSliceRoot) => s.auth.accessToken;
export const selectRefreshToken = (s: AuthSliceRoot) => s.auth.refreshToken;
export const selectCurrentUser = (s: AuthSliceRoot) => s.auth.user;
export const selectAuthStatus = (s: AuthSliceRoot) => s.auth.status;
export const selectIsAuthenticated = (s: AuthSliceRoot) =>
  Boolean(s.auth.accessToken) || Boolean(s.auth.refreshToken);
