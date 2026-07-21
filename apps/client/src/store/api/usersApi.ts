import { baseApi } from './baseApi';
import type { Language, MeResponse, UserProfile } from './authApi';

/**
 * usersApi — самообслуживание текущего пользователя (docs/API.md §5, Bearer).
 *
 * Контракты:
 * - PATCH /users/me          { default_language? } → 200 user (MeResponse).
 *     Логин-email сюда больше не принимается — только через contact-change
 *     ниже (подтверждение OTP на новый email).
 * - PATCH /users/me/profile  { first_name?, last_name?, display_name?,
 *     avatar_url?, contact_phone?, preferred_language? } → 200 profile.
 * - POST  /users/me/avatar   multipart поле `file` (image/jpeg|png|webp,
 *     ≤10 MiB) → 201 { avatar_url }. Сервер сам сохраняет ключ в профиле —
 *     отдельный PATCH avatar_url не нужен.
 * - DELETE /users/me/avatar  → 204. Сбрасывает загруженный аватар.
 * - POST /users/me/contact-change/request { channel, destination } → 200
 *     { request_id, channel, expires_in, resend_after }. Запрашивает OTP на
 *     НОВЫЙ логин-телефон/email (не текущий); ошибки CONTACT_TAKEN/VALIDATION_ERROR.
 * - POST /users/me/contact-change/verify  { channel, destination, code } →
 *     200 обновлённый /me (та же форма, что GET /auth/me). Применяет смену
 *     логин-контакта только после подтверждения кодом; инвалидирует
 *     'Auth'/'User', как остальные мутации.
 * - POST /users/me/contact-phone/request { destination } → 200
 *     { applied: true } (номер = верифицированному логин-телефону, смена уже
 *     применена — инвалидируем 'Auth'/'User') ЛИБО { applied: false,
 *     request_id, channel: 'SMS', expires_in, resend_after } (нужен код,
 *     теги не трогаем).
 * - POST /users/me/contact-phone/verify  { destination, code } → 200
 *     обновлённый /me. Применяет смену публичного contact_phone и ставит
 *     contact_phone_verified=true; инвалидирует 'Auth'/'User'.
 *
 * snake_case в телах, enum-значения UPPERCASE (UZ|RU|EN). Все мутации
 * инвалидируют 'Auth' и 'User', чтобы GET /auth/me перечитал свежие данные.
 */

/** Тело PATCH /users/me — подмножество полей пользователя (email не входит). */
export interface UpdateUserBody {
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

/** Ответ POST /users/me/avatar — свежая подписанная ссылка на загруженный аватар. */
export interface UploadAvatarResponse {
  avatar_url: string;
}

/** Канал OTP-подтверждения смены логин-контакта. */
export type ContactChannel = 'SMS' | 'EMAIL';

/** Тело `POST /users/me/contact-change/request`. */
export interface RequestContactChangeBody {
  channel: ContactChannel;
  destination: string;
}

/** Ответ `POST /users/me/contact-change/request` — метаданные отправленного OTP. */
export interface RequestContactChangeResult {
  request_id: string;
  channel: ContactChannel;
  expires_in: number;
  resend_after: number;
}

/** Тело `POST /users/me/contact-change/verify` — тот же destination + код. */
export interface VerifyContactChangeBody {
  channel: ContactChannel;
  destination: string;
  code: string;
}

/** Ответ `POST /users/me/contact-phone/request`. */
export type RequestContactPhoneResult =
  | { applied: true }
  | {
      applied: false;
      request_id: string;
      channel: 'SMS';
      expires_in: number;
      resend_after: number;
    };

/** Тело `POST /users/me/contact-phone/request`. */
export interface RequestContactPhoneBody {
  destination: string;
}

/** Тело `POST /users/me/contact-phone/verify`. */
export interface VerifyContactPhoneBody {
  destination: string;
  code: string;
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

    // Загрузка аватара — прямой multipart (как uploadListingMedia): поле `file`,
    // Content-Type не выставляем вручную (fetchBaseQuery прокидывает FormData).
    uploadAvatar: build.mutation<UploadAvatarResponse, File>({
      query: (file) => {
        const form = new FormData();
        form.append('file', file);
        return {
          url: '/users/me/avatar',
          method: 'POST',
          body: form,
        };
      },
      invalidatesTags: ['Auth', 'User'],
    }),

    deleteAvatar: build.mutation<void, void>({
      query: () => ({
        url: '/users/me/avatar',
        method: 'DELETE',
      }),
      invalidatesTags: ['Auth', 'User'],
    }),

    // Шаг 1: запросить OTP на новый логин-телефон/email. Ничего ещё не
    // меняется — смена применяется только после verify, поэтому теги не
    // инвалидируем.
    requestContactChange: build.mutation<RequestContactChangeResult, RequestContactChangeBody>({
      query: (body) => ({
        url: '/users/me/contact-change/request',
        method: 'POST',
        body,
      }),
    }),

    // Шаг 2: подтвердить код — сервер применяет смену и возвращает /me.
    verifyContactChange: build.mutation<MeResponse, VerifyContactChangeBody>({
      query: (body) => ({
        url: '/users/me/contact-change/verify',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Auth', 'User'],
    }),

    // Смена публичного контакт-телефона. request: применяет сразу (applied:true,
    // если = верифицированному логин-телефону) — тогда инвалидируем /me; иначе
    // шлёт OTP и ничего не меняет (теги не трогаем).
    requestContactPhoneChange: build.mutation<RequestContactPhoneResult, RequestContactPhoneBody>({
      query: (body) => ({
        url: '/users/me/contact-phone/request',
        method: 'POST',
        body,
      }),
      invalidatesTags: (result) => (result?.applied ? ['Auth', 'User'] : []),
    }),

    verifyContactPhoneChange: build.mutation<MeResponse, VerifyContactPhoneBody>({
      query: (body) => ({
        url: '/users/me/contact-phone/verify',
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
  useUploadAvatarMutation,
  useDeleteAvatarMutation,
  useRequestContactChangeMutation,
  useVerifyContactChangeMutation,
  useRequestContactPhoneChangeMutation,
  useVerifyContactPhoneChangeMutation,
} = usersApi;
