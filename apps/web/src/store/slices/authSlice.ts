import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../api/authApi';

/**
 * authSlice (ADMIN-04) — хранилище аутентификации админки.
 *
 * Стратегия хранения токенов:
 * - access  — только в памяти (этот slice). Не попадает в localStorage,
 *   живёт до перезагрузки страницы; восстанавливается через refresh.
 * - refresh — в localStorage (переживает перезагрузку), зеркалится в state.
 *
 * При загрузке приложения вызывается initializeAuth() — подтягивает refresh
 * из localStorage. Первый защищённый запрос без access получит 401, после чего
 * baseQueryWithReauth обменяет refresh на свежий access.
 */

const REFRESH_TOKEN_KEY = 'avino.admin.refresh_token';

function readStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function persistRefreshToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    /* приватный режим / отключённый storage — игнорируем */
  }
}

export interface AuthState {
  /** Access-токен — только в памяти. */
  accessToken: string | null;
  /** Refresh-токен — зеркало localStorage. */
  refreshToken: string | null;
  /** Текущий пользователь (из verify / me). */
  user: AuthUser | null;
  /** Прошла ли гидрация из localStorage. */
  initialized: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  initialized: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Гидрация refresh-токена из localStorage при старте приложения. */
    initializeAuth(state) {
      state.refreshToken = readStoredRefreshToken();
      state.initialized = true;
    },

    /** Полные креды после успешного verifyOtp (access + refresh + user). */
    setCredentials(
      state,
      action: PayloadAction<{
        access_token: string;
        refresh_token: string;
        user?: AuthUser;
      }>,
    ) {
      state.accessToken = action.payload.access_token;
      state.refreshToken = action.payload.refresh_token;
      if (action.payload.user) {
        state.user = action.payload.user;
      }
      persistRefreshToken(action.payload.refresh_token);
    },

    /** Ротация токенов после /auth/refresh (без user). */
    setTokens(
      state,
      action: PayloadAction<{ access_token: string; refresh_token: string }>,
    ) {
      state.accessToken = action.payload.access_token;
      state.refreshToken = action.payload.refresh_token;
      persistRefreshToken(action.payload.refresh_token);
    },

    /** Разлогин — чистим память и localStorage. */
    logOut(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      persistRefreshToken(null);
    },
  },
});

export const { initializeAuth, setCredentials, setTokens, logOut } =
  authSlice.actions;

export const authReducer = authSlice.reducer;

// ─── Селекторы ──────────────────────────────────────────────────────────────
// Типизированы по минимальной форме { auth }, чтобы избежать цикла импорта
// с store.ts. RootState ей удовлетворяет, поэтому useSelector работает.

type AuthSliceRoot = { auth: AuthState };

export const selectAccessToken = (s: AuthSliceRoot) => s.auth.accessToken;
export const selectRefreshToken = (s: AuthSliceRoot) => s.auth.refreshToken;
export const selectCurrentUser = (s: AuthSliceRoot) => s.auth.user;
export const selectAuthInitialized = (s: AuthSliceRoot) => s.auth.initialized;
export const selectIsAuthenticated = (s: AuthSliceRoot) =>
  Boolean(s.auth.accessToken) || Boolean(s.auth.refreshToken);
