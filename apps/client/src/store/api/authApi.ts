import { baseApi } from './baseApi';
import { clearCredentials, setCredentials, setUser } from '../slices/authSlice';

/**
 * authApi — passwordless OTP flow публичного портала (docs/API.md §3).
 *
 * Контракты:
 * - POST /auth/otp/request  { channel, destination } → request metadata
 * - POST /auth/otp/verify   { channel, destination, code } → access+refresh+user
 * - POST /auth/refresh      (без тела; refresh из cookie avino_rt) → новая пара
 * - POST /auth/logout       (без тела; family из cookie avino_rt) → 204
 * - GET  /auth/me           → пользователь + профиль + роли
 *
 * Подстановка Bearer и авто-refresh — baseQueryWithReauth; здесь
 * типизированные эндпоинты, side-effects (setCredentials/setUser) и хуки.
 * snake_case как в API.md, enum-значения UPPERCASE.
 */

// ─── Общие типы ───────────────────────────────────────────────────────────

export type OtpChannel = 'SMS' | 'EMAIL';
export type UserRole = 'USER' | 'AGENT' | 'AGENCY' | 'MODERATOR' | 'ADMIN';
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
  contact_phone_verified: boolean;
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

/** Ответ `/auth/refresh`. Тело всё ещё несёт refresh_token (mobile), но web
 *  его игнорирует — токен приходит/уходит через httpOnly cookie (ADR-0153). */
export type RefreshResponse = TokenPair;

export interface MeLegalConsent {
  /** Версия последнего согласия; null — ни разу не соглашался. */
  accepted_version: number | null;
  accepted_at: string | null;
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
  legal_consent: MeLegalConsent;
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
              user: data.user,
            }),
          );
        } catch {
          /* ошибку показывает UI через apiError-хелпер */
        }
      },
    }),

    googleLogin: build.mutation<VerifyOtpResponse, { id_token: string }>({
      query: (body) => ({
        url: '/auth/google',
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
              user: data.user,
            }),
          );
        } catch {
          /* ошибку показывает UI через apiError-хелпер */
        }
      },
    }),

    appleLogin: build.mutation<
      VerifyOtpResponse,
      { id_token: string; first_name?: string; last_name?: string }
    >({
      query: (body) => ({
        url: '/auth/apple',
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
              user: data.user,
            }),
          );
        } catch {
          /* ошибку показывает UI через apiError-хелпер */
        }
      },
    }),

    // Ротация БЕЗ ТЕЛА: сервер читает refresh из httpOnly cookie `avino_rt`
    // (ADR-0153) и ставит новую cookie. Успех → кладём новый access в стор
    // (без `user` → identityResetListener трактует как ротацию, кэш не сбрасывает).
    // Используется бутстрапом (SessionBootstrap) и авто-refresh в baseQuery.
    refresh: build.mutation<RefreshResponse, void>({
      query: () => ({
        url: '/auth/refresh',
        method: 'POST',
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setCredentials({ access_token: data.access_token }));
        } catch {
          /* нет валидной cookie-сессии → SessionBootstrap пометит гостя */
        }
      },
    }),

    // Логаут БЕЗ ТЕЛА: family адресует cookie `avino_rt` (ADR-0153); Bearer
    // авторизует запрос. Сервер отзывает family и чистит cookie.
    logout: build.mutation<void, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
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
  useGoogleLoginMutation,
  useAppleLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
} = authApi;
