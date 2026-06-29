import { baseApi } from './baseApi';
import type { Language, MeResponse, UserProfile } from './authApi';

/**
 * usersApi — самообслуживание текущего пользователя (docs/API.md §5, Bearer).
 *
 * Контракты:
 * - PATCH /users/me          { email?, default_language? } → 200 user (MeResponse)
 *     Ошибки: 400 (валидация), 409 CONTACT_TAKEN (email занят).
 *     Смена email триггерит OTP re-verify на бэке — просто вызываем.
 * - PATCH /users/me/profile  { first_name?, last_name?, display_name?,
 *     avatar_url?, contact_phone?, preferred_language? } → 200 profile.
 *
 * snake_case в телах, enum-значения UPPERCASE (UZ|RU|EN). Обе мутации
 * инвалидируют 'Auth' и 'User', чтобы GET /auth/me перечитал свежие данные.
 */

/** Тело PATCH /users/me — подмножество полей пользователя. */
export interface UpdateUserBody {
  email?: string;
  default_language?: Language;
}

/** Тело PATCH /users/me/profile — подмножество полей профиля. */
export interface UpdateProfileBody {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  contact_phone?: string | null;
  preferred_language?: Language;
}

/** Тело `POST /api/v1/users/me/legal-consent` — обе галочки обязательны (true). */
export interface AcceptLegalConsentBody {
  terms_accepted: boolean;
  privacy_accepted: boolean;
}

/** Ответ согласия — та же форма, что `MeResponse.legal_consent`. */
export interface LegalConsentState {
  accepted_version: number | null;
  accepted_at: string | null;
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    updateUser: build.mutation<MeResponse, UpdateUserBody>({
      query: (body) => ({
        url: '/users/me',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Auth', 'User'],
    }),

    updateProfile: build.mutation<UserProfile, UpdateProfileBody>({
      query: (body) => ({
        url: '/users/me/profile',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Auth', 'User'],
    }),

    acceptLegalConsent: build.mutation<LegalConsentState, AcceptLegalConsentBody>({
      query: (body) => ({
        url: '/users/me/legal-consent',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Auth', 'User'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useUpdateUserMutation,
  useUpdateProfileMutation,
  useAcceptLegalConsentMutation,
} = usersApi;
