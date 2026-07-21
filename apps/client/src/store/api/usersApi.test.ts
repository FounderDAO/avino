import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * usersApi — contact-change эндпоинты (Task 6, docs/superpowers/plans/2026-07-21-contact-change-otp.md).
 * Тест бьёт по настоящему store + baseApi (как apiErrorToastMiddleware.test.ts),
 * но подменяет транспортный слой `baseQueryWithReauth` мок-функцией — так
 * реальный fetchBaseQuery не пытается конструировать Request/AbortSignal
 * (в jsdom это падает на несовместимости с undici), а endpoint-конфиг
 * (url/method/body, invalidatesTags) проверяется как есть.
 */
const { baseQueryMock } = vi.hoisted(() => ({ baseQueryMock: vi.fn() }));
vi.mock('./baseQuery', () => ({ baseQueryWithReauth: baseQueryMock }));

import { makeStore } from '../store';
import { usersApi } from './usersApi';
import { authApi } from './authApi';

const ME_BASE = {
  id: 'u1',
  phone: '+998901234567',
  email: 'user@example.com',
  status: 'ACTIVE' as const,
  default_language: 'RU' as const,
  is_phone_verified: true,
  is_email_verified: true,
  roles: ['USER'] as const,
  profile: {
    first_name: 'Ivan',
    last_name: null,
    display_name: null,
    avatar_url: null,
    contact_phone: null,
    preferred_language: 'RU' as const,
  },
  legal_consent: { accepted_version: 1, accepted_at: '2026-01-01T00:00:00.000Z' },
};

describe('usersApi — contact-change', () => {
  beforeEach(() => {
    baseQueryMock.mockReset();
  });

  it('requestContactChange шлёт POST /users/me/contact-change/request с телом', async () => {
    const result = { request_id: 'r-1', channel: 'SMS', expires_in: 300, resend_after: 60 };
    baseQueryMock.mockResolvedValueOnce({ data: result });

    const store = makeStore();
    const { data } = await store.dispatch(
      usersApi.endpoints.requestContactChange.initiate({
        channel: 'SMS',
        destination: '+998901234567',
      }),
    );

    expect(baseQueryMock).toHaveBeenCalledTimes(1);
    expect(baseQueryMock.mock.calls[0][0]).toEqual({
      url: '/users/me/contact-change/request',
      method: 'POST',
      body: { channel: 'SMS', destination: '+998901234567' },
    });
    expect(data).toEqual(result);
  });

  it('verifyContactChange инвалидирует тот же тег, что getMe — вызывает повторный /auth/me', async () => {
    const updated = { ...ME_BASE, phone: '+998939998877' };
    baseQueryMock
      .mockResolvedValueOnce({ data: ME_BASE }) // GET /auth/me (подписка)
      .mockResolvedValueOnce({ data: updated }) // POST verify
      .mockResolvedValueOnce({ data: updated }); // GET /auth/me (рефетч по инвалидации)

    const store = makeStore();

    // Активная подписка на getMe — без неё инвалидация тега не триггерит рефетч.
    await store.dispatch(authApi.endpoints.getMe.initiate());
    expect(baseQueryMock).toHaveBeenCalledTimes(1);

    const verifyResult = await store
      .dispatch(
        usersApi.endpoints.verifyContactChange.initiate({
          channel: 'SMS',
          destination: '+998939998877',
          code: '123456',
        }),
      )
      .unwrap();
    expect(verifyResult).toEqual(updated);

    // Инвалидация тегов запускает рефетч асинхронно — ждём микротаску.
    await new Promise((r) => setTimeout(r, 0));

    expect(baseQueryMock).toHaveBeenCalledTimes(3);
    expect(baseQueryMock.mock.calls[1][0]).toEqual({
      url: '/users/me/contact-change/verify',
      method: 'POST',
      body: { channel: 'SMS', destination: '+998939998877', code: '123456' },
    });
    expect(baseQueryMock.mock.calls[2][0]).toEqual({ url: '/auth/me' });
  });
});
