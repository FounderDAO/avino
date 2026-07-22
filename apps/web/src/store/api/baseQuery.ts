import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from '../store';
import { logOut, setTokens, selectAccessToken } from '../slices/authSlice';
import type { RefreshResponse } from './authApi';

/**
 * baseQueryWithReauth (ADMIN-04, ADR-0153).
 *
 * 1. Подставляет `Authorization: Bearer <access>`; `credentials:'include'` шлёт
 *    httpOnly cookie `avino_rt` на API (cross-origin same-site; CORS API отвечает
 *    Allow-Credentials).
 * 2. На `401` один раз дёргает `/auth/refresh` БЕЗ ТЕЛА — сервер ротирует по
 *    cookie `avino_rt` и ставит новую cookie. Обновляет access и повторяет запрос.
 * 3. При неудаче refresh — разлогинивает (logOut).
 *
 * Single-flight внутри вкладки (`refreshInFlight`) + сериализация МЕЖДУ вкладками
 * через Web Locks API: две вкладки, одновременно поймавшие 401, иначе оба
 * предъявили бы один и тот же cookie-токен → второй уже отработан → TOKEN_REUSED
 * → сервер отзывает всю family. Лок держит очередь на весь origin.
 */

const API_BASE_URL = `${
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'
}/api/v1`;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  // Слать/принимать httpOnly cookie avino_rt cross-origin (ADR-0153).
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = selectAccessToken(getState() as RootState);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

type RtkApi = Parameters<typeof rawBaseQuery>[1];
type RtkExtra = Parameters<typeof rawBaseQuery>[2];

/** Промис текущей ротации внутри ЭТОЙ вкладки (single-flight). */
let refreshInFlight: Promise<boolean> | null = null;

/** Имя кросс-вкладочного лока (Web Locks API). */
const REFRESH_LOCK = 'avino.admin.auth-refresh';

/**
 * Один реальный обмен refresh → новый access. Тело НЕ передаётся: сервер читает
 * refresh из httpOnly cookie `avino_rt` (ADR-0153) и ставит новую cookie. В
 * ответе интересует только `access_token` (refresh теперь невидим для JS).
 */
async function performRefresh(
  api: RtkApi,
  extraOptions: RtkExtra,
): Promise<boolean> {
  const result = await rawBaseQuery(
    { url: '/auth/refresh', method: 'POST' },
    api,
    extraOptions,
  );

  const data = result.data as RefreshResponse | undefined;
  if (data?.access_token) {
    api.dispatch(setTokens({ access_token: data.access_token }));
    return true;
  }
  return false;
}

/**
 * Сериализация refresh МЕЖДУ вкладками (Web Locks API). Fallback (нет
 * `navigator.locks`: SSR, старые браузеры) — только внутривкладочный single-flight.
 */
function refreshUnderCrossTabLock(
  api: RtkApi,
  extraOptions: RtkExtra,
): Promise<boolean> {
  const locks =
    typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return performRefresh(api, extraOptions);
  // lib.dom-оверлоад LockManager.request выводит T=Promise<boolean> (двойной
  // Promise в типе); в рантайме async-цепочка его разворачивает.
  return locks.request(REFRESH_LOCK, () =>
    performRefresh(api, extraOptions),
  ) as unknown as Promise<boolean>;
}

async function refreshTokens(
  api: RtkApi,
  extraOptions: RtkExtra,
): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        return await refreshUnderCrossTabLock(api, extraOptions);
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    // Сам refresh-запрос не должен рекурсивно реавторизоваться.
    const isRefreshCall =
      typeof args === 'object' && args.url === '/auth/refresh';

    if (!isRefreshCall) {
      const refreshed = await refreshTokens(api, extraOptions);
      if (refreshed) {
        result = await rawBaseQuery(args, api, extraOptions);
      } else {
        api.dispatch(logOut());
      }
    }
  }

  return result;
};
