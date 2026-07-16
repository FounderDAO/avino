/**
 * supportApi — обращения в поддержку (POST /support/requests).
 *
 * Публичная ручка (Bearer опционален — baseQuery сам приложит токен, если
 * есть): гость и юзер оставляют обращение с формы «Помощь». Ответ — квиток
 * `{ id, status }`.
 */
import { baseApi } from './baseApi';

/** Тело обращения в поддержку. */
export interface CreateSupportRequestBody {
  name?: string;
  contact: string;
  message: string;
}

/** Квиток созданного обращения. */
export interface SupportRequestReceipt {
  id: string;
  status: string;
}

export const supportApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Оставить обращение в поддержку. POST /support/requests. */
    createSupportRequest: build.mutation<SupportRequestReceipt, CreateSupportRequestBody>({
      query: (body) => ({ url: '/support/requests', method: 'POST', body }),
    }),
  }),
  overrideExisting: false,
});

export const { useCreateSupportRequestMutation } = supportApi;
