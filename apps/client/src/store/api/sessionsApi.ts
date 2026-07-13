/**
 * sessionsApi — активные сессии пользователя (docs/API.md §3, ADR-0143).
 *
 * Сессия = session family refresh-токенов; `is_current` метится бэком по
 * `fid` предъявленного access-токена (старые access без `fid` дают false —
 * метка появляется после релогина/ротации).
 *
 * Оба эндпоинта Bearer-only — потребитель обязан передавать
 * `{ skip: !isAuthenticated }`. Тосты revoke — ручные в UI
 * (эндпоинт в SUPPRESSED_ENDPOINTS): 404 — не ошибка, а «уже завершена».
 */
import { baseApi } from './baseApi';

/** Элемент GET /auth/sessions (docs/API.md §3). */
export interface AuthSession {
  id: string;
  /** Момент логина. */
  created_at: string;
  /** Последняя ротация refresh (= created_at, если ротаций не было). */
  last_rotated_at: string;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
}

export const sessionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Активные сессии текущего пользователя. GET /auth/sessions. */
    getSessions: build.query<AuthSession[], void>({
      query: () => '/auth/sessions',
      providesTags: ['Session'],
    }),

    /**
     * Отозвать сессию по её id (fid). DELETE /auth/sessions/:fid → 204.
     * Чужой/несуществующий fid → 404 NOT_FOUND (идемпотентен).
     */
    revokeSession: build.mutation<void, string>({
      query: (fid) => ({
        url: `/auth/sessions/${encodeURIComponent(fid)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Session'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetSessionsQuery, useRevokeSessionMutation } = sessionsApi;
