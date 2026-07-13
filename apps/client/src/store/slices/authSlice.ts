import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser, MeResponse } from '../api/authApi';

/**
 * authSlice — хранилище аутентификации публичного портала (TASK-150).
 *
 * Стратегия хранения токенов (ADR-0142, паритет с админкой):
 * - access — ТОЛЬКО в памяти Redux. В localStorage не пишется: XSS/сторонний
 *   скрипт не может его прочитать. После перезагрузки первый защищённый
 *   запрос (SessionBootstrap → GET /auth/me) ловит 401, baseQueryWithReauth
 *   ротирует пару по refresh и access восстанавливается.
 * - refresh — зеркалится в localStorage (переживает перезагрузку), состояние
 *   гидрируется из storage лениво в initialState — но только в браузере
 *   (SSR-guard: на сервере window отсутствует, initialState пуст, чтобы не
 *   было рассинхрона при гидрации Next.js).
 *
 * `user` хранит полный MeResponse (из GET /auth/me) либо краткую форму
 * AuthUser (из verifyOtp) — обе совместимы по общему набору полей.
 */

/** Легаси-ключ (до ADR-0142 access тоже персистился) — вычищается при старте. */
const LEGACY_ACCESS_TOKEN_KEY = 'avino.client.access_token';
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
  // Миграция: подчистить access-токен, сохранённый кодом до ADR-0142.
  persist(LEGACY_ACCESS_TOKEN_KEY, null);
  const hydratedRefresh = readStored(REFRESH_TOKEN_KEY);
  return {
    accessToken: null,
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
      persist(REFRESH_TOKEN_KEY, null);
    },
  },
});

export const { setCredentials, setUser, clearCredentials } = authSlice.actions;

/**
 * Актуальный refresh из localStorage — общий для всех вкладок источник истины.
 * Redux-снапшот вкладки может протухнуть после ротации в соседней вкладке;
 * ротация протухшим токеном = TOKEN_REUSED → отзыв всей session family.
 */
export function readPersistedRefreshToken(): string | null {
  return readStored(REFRESH_TOKEN_KEY);
}

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
