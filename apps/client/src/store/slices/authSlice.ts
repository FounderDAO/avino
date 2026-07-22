import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser, MeResponse } from '../api/authApi';

/**
 * authSlice — хранилище аутентификации публичного портала (TASK-150, ADR-0153).
 *
 * Стратегия хранения токенов:
 * - access — ТОЛЬКО в памяти Redux (ADR-0142). В localStorage не пишется: XSS/
 *   сторонний скрипт не может его прочитать.
 * - refresh — БОЛЬШЕ НЕ В JS (ADR-0153, TASK-256 PR-2). Живёт в httpOnly cookie
 *   `avino_rt`, недоступной скрипту (нет XSS-эксфильтрации, нет JS-токена для
 *   гонки вкладок). Сервер сам ротирует его по cookie на `/auth/refresh`.
 *
 * Следствие: при загрузке страницы JS НЕ ЗНАЕТ синхронно, есть ли сессия
 * (cookie не видна). Поэтому `status` начинается с `idle` = «проверяем»: на
 * старте SessionBootstrap делает пробный silent-refresh и переводит статус в
 * `authenticated` (cookie валидна) либо `unauthenticated` (гость). До этого
 * момента гейты (авто-LoginModal, гость-экраны) обязаны ждать `resolved`.
 *
 * `user` хранит полный MeResponse (из GET /auth/me) либо краткую форму
 * AuthUser (из verifyOtp) — обе совместимы по общему набору полей.
 */

/** Легаси-ключи localStorage — вычищаются при старте (в JS токенов больше нет). */
const LEGACY_ACCESS_TOKEN_KEY = 'avino.client.access_token'; // до ADR-0142
const LEGACY_REFRESH_TOKEN_KEY = 'avino.client.refresh_token'; // до ADR-0153

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function clearStored(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
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
  accessToken: string | null;
  /** Текущий пользователь (из verify / me). */
  user: MeResponse | null;
  status: AuthStatus;
}

/**
 * initialState всегда одинаков на сервере и клиенте (никакого чтения window) —
 * нет рассинхрона гидрации Next.js. refresh-токен из JS больше не читается: его
 * держит httpOnly cookie. Смена локали ремонтирует store в `idle` → бутстрап
 * заново поднимет сессию из cookie (токен переживает пересоздание store).
 */
function buildInitialState(): AuthState {
  // Миграция: вычистить токены, оставленные в localStorage прежними версиями.
  clearStored(LEGACY_ACCESS_TOKEN_KEY);
  clearStored(LEGACY_REFRESH_TOKEN_KEY);
  return { accessToken: null, user: null, status: 'idle' };
}

const authSlice = createSlice({
  name: 'auth',
  initialState: buildInitialState,
  reducers: {
    /**
     * Установка кредов. Используется логином (verifyOtp/google/apple — с `user`)
     * и refresh-ротацией / бутстрапом (только access, без `user`). refresh в JS
     * не хранится — он в cookie `avino_rt`.
     */
    setCredentials(
      state,
      action: PayloadAction<{
        access_token: string;
        user?: AuthUser | MeResponse | null;
      }>,
    ) {
      state.accessToken = action.payload.access_token;
      if (action.payload.user !== undefined) {
        state.user = (action.payload.user as MeResponse) ?? null;
      }
      state.status = 'authenticated';
    },

    /** Обновление текущего пользователя (из GET /auth/me). */
    setUser(state, action: PayloadAction<MeResponse | null>) {
      state.user = action.payload;
    },

    /**
     * Гость / разлогин: сессии нет. Чистим память; refresh-cookie гасит сервер
     * (clearCookie на `/auth/logout`) — из JS её всё равно не достать.
     */
    clearCredentials(state) {
      state.accessToken = null;
      state.user = null;
      state.status = 'unauthenticated';
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
export const selectCurrentUser = (s: AuthSliceRoot) => s.auth.user;
export const selectAuthStatus = (s: AuthSliceRoot) => s.auth.status;
export const selectIsAuthenticated = (s: AuthSliceRoot) =>
  Boolean(s.auth.accessToken);
/**
 * Сессия определена (пробный silent-refresh завершён). Гейты, зависящие от
 * «залогинен ли», должны ждать resolved, иначе во время `idle`-окна ошибочно
 * открыли бы LoginModal / показали гость-экран уже вошедшему пользователю.
 */
export const selectAuthResolved = (s: AuthSliceRoot) => s.auth.status !== 'idle';
