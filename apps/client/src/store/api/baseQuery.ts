import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from '../store';
import {
  clearCredentials,
  setCredentials,
  selectAccessToken,
  selectRefreshToken,
  readPersistedRefreshToken,
} from '../slices/authSlice';
import type { RefreshResponse } from './authApi';

/**
 * baseQueryWithReauth публичного портала (TASK-150).
 *
 * 1. Подставляет `Authorization: Bearer <access>` в каждый запрос.
 * 2. На `401` один раз дёргает `/auth/refresh`, обновляет токены и повторяет
 *    исходный запрос.
 * 3. При неудаче refresh — разлогинивает (clearCredentials).
 *
 * Конкурентные 401-ответы обслуживаются одним refresh (single-flight):
 * пока идёт ротация, остальные запросы ждут её результат, а не плодят
 * параллельные /auth/refresh (повторное использование ротированного токена
 * отозвало бы всю session family — docs/API.md §3).
 */

const API_BASE_URL = `${
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'
}/api/v1`;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = selectAccessToken(getState() as RootState);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    // Язык интерфейса = язык контента (API.md §1: Accept-Language).
    // <html lang> ставится сервером из [locale]-сегмента — источник надёжный.
    if (typeof document !== 'undefined' && document.documentElement.lang) {
      headers.set('Accept-Language', document.documentElement.lang);
    }
    return headers;
  },
});

type RtkApi = Parameters<typeof rawBaseQuery>[1];
type RtkExtra = Parameters<typeof rawBaseQuery>[2];

/** Промис текущей ротации (single-flight mutex). */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(
  api: RtkApi,
  extraOptions: RtkExtra,
): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        // localStorage — общий для вкладок источник истины: после ротации в
        // соседней вкладке Redux-снапшот протухает, а повторная ротация старым
        // токеном = TOKEN_REUSED → отзыв всей family (docs/API.md §3).
        const refreshToken =
          readPersistedRefreshToken() ??
          selectRefreshToken(api.getState() as RootState);
        if (!refreshToken) return false;

        const result = await rawBaseQuery(
          {
            url: '/auth/refresh',
            method: 'POST',
            body: { refresh_token: refreshToken },
          },
          api,
          extraOptions,
        );

        const data = result.data as RefreshResponse | undefined;
        if (data?.access_token && data?.refresh_token) {
          api.dispatch(
            setCredentials({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
            }),
          );
          return true;
        }
        return false;
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
        api.dispatch(clearCredentials());
      }
    }
  }

  return result;
};
