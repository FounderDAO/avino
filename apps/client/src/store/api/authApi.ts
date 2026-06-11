import { baseApi } from './baseApi';
import { clearCredentials, setCredentials, setUser } from '../slices/authSlice';

/**
 * authApi — passwordless OTP flow публичного портала (docs/API.md §3).
 *
 * Контракты:
 * - POST /auth/otp/request  { channel, destination } → request metadata
 * - POST /auth/otp/verify   { channel, destination, code } → access+refresh+user
 * - POST /auth/refresh      { refresh_token } → новая пара токенов
 * - POST /auth/logout       { refresh_token } → 204
 * - GET  /auth/me           → пользователь + профиль + роли
 *
 * Подстановка Bearer и авто-refresh — baseQueryWithReauth; здесь
 * типизированные эндпоинты, side-effects (setCredentials/setUser) и хуки.
 * snake_case как в API.md, enum-значения UPPERCASE.
 */

// ─── Общие типы ───────────────────────────────────────────────────────────

export type OtpChannel = 'SMS' | 'EMAIL';
export type UserRole = 'USER' | 'AGENT' | 'MODERATOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';
export type Language = 'UZ' | 'RU' | 'EN';

/** Пользователь в ответе verify (краткая форма). */
export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  default_language: Language;
  status: UserStatus;
  roles: UserRole[];
  is_phone_verified: boolean;
  is_email_verified?: boolean;
}

/** Профиль из GET /auth/me. */
export interface UserProfile {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  contact_phone: string | null;
  preferred_language: Language;
}

/** Пара токенов, общая для verify/refresh. */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

// ─── Запросы/ответы ─────────────────────────────────────────────────────────

export interface RequestOtpBody {
  channel: OtpChannel;
  destination: string;
}

export interface RequestOtpResponse {
  request_id: string;
  channel: OtpChannel;
  expires_in: number;
  resend_after: number;
}

export interface VerifyOtpBody {
  channel: OtpChannel;
  destination: string;
  code: string;
}

export interface VerifyOtpResponse extends TokenPair {
  user: AuthUser;
}

export interface RefreshBody {
  refresh_token: string;
}

export type RefreshResponse = TokenPair;

export interface LogoutBody {
  refresh_token: string;
}

export interface MeResponse {
  id: string;
  phone: string | null;
  email: string | null;
  status: UserStatus;
  default_language: Language;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  roles: UserRole[];
  profile: UserProfile;
}

// ─── Эндпоинты ────────────────────────────────────────────────────────────

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    requestOtp: build.mutation<RequestOtpResponse, RequestOtpBody>({
      query: (body) => ({
        url: '/auth/otp/request',
        method: 'POST',
        body,
      }),
    }),

    verifyOtp: build.mutation<VerifyOtpResponse, VerifyOtpBody>({
      query: (body) => ({
        url: '/auth/otp/verify',
        method: 'POST',
        body,
      }),
      // Успешный вход меняет «текущего пользователя».
      invalidatesTags: ['Auth', 'User'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            setCredentials({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              user: data.user,
            }),
          );
        } catch {
          /* ошибку показывает UI через apiError-хелпер */
        }
      },
    }),

    refresh: build.mutation<RefreshResponse, RefreshBody>({
      query: (body) => ({
        url: '/auth/refresh',
        method: 'POST',
        body,
      }),
    }),

    logout: build.mutation<void, LogoutBody>({
      query: (body) => ({
        url: '/auth/logout',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Auth', 'User'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          // Чистим локальные креды независимо от исхода серверного отзыва.
          dispatch(clearCredentials());
        }
      },
    }),

    getMe: build.query<MeResponse, void>({
      query: () => ({ url: '/auth/me' }),
      providesTags: ['Auth', 'User'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setUser(data));
        } catch {
          /* 401 обрабатывает baseQueryWithReauth */
        }
      },
    }),
  }),
  overrideExisting: false,
});

export const {
  useRequestOtpMutation,
  useVerifyOtpMutation,
  useRefreshMutation,
  useLogoutMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
} = authApi;
