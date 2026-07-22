/**
 * identityResetListener — сброс RTK Query-кэша при смене личности (админка).
 *
 * Регрессия: после смены аккаунта админа `getMe`/admin-запросы отдавали
 * закэшированные данные прежнего пользователя (кэш ключуется по args, не по
 * пользователю). Reset обязан срабатывать на login/logout, но НЕ на ротацию
 * токена (`setTokens`, тот же пользователь).
 */
import { describe, expect, it } from 'vitest';
import { makeStore } from './store';
import { setCredentials, setTokens, logOut } from './slices/authSlice';
import { authApi, type MeResponse } from './api/authApi';

/** Дать асинхронному listener-эффекту отработать после dispatch. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const fakeMe: MeResponse = {
  id: 'admin-a',
  phone: null,
  email: 'a@example.com',
  status: 'ACTIVE',
  default_language: 'RU',
  is_phone_verified: true,
  is_email_verified: true,
  roles: ['ADMIN'],
  profile: {
    first_name: 'A',
    last_name: null,
    display_name: null,
    avatar_url: null,
    contact_phone: null,
    preferred_language: 'RU',
  },
};

const fakeUser = {
  id: 'admin-b',
  phone: null,
  email: 'b@example.com',
  default_language: 'RU' as const,
  status: 'ACTIVE' as const,
  roles: ['ADMIN' as const],
  is_phone_verified: true,
};

/** Положить в кэш RTK Query запись getMe без обращения к сети. */
async function seedCache(store: ReturnType<typeof makeStore>): Promise<void> {
  await store.dispatch(
    authApi.util.upsertQueryData('getMe', undefined, fakeMe),
  );
}

const cachedQueryCount = (store: ReturnType<typeof makeStore>): number =>
  Object.keys(store.getState().api.queries).length;

describe('identityResetListener (admin): сброс кэша при смене личности', () => {
  it('login (setCredentials) очищает кэш прежнего пользователя', async () => {
    const store = makeStore();
    await seedCache(store);
    expect(cachedQueryCount(store)).toBeGreaterThan(0);

    store.dispatch(setCredentials({ access_token: 'a', user: fakeUser }));
    await flush();

    expect(cachedQueryCount(store)).toBe(0);
  });

  it('logout (logOut) очищает кэш', async () => {
    const store = makeStore();
    await seedCache(store);
    expect(cachedQueryCount(store)).toBeGreaterThan(0);

    store.dispatch(logOut());
    await flush();

    expect(cachedQueryCount(store)).toBe(0);
  });

  it('ротация токена (setTokens) НЕ трогает кэш', async () => {
    const store = makeStore();
    await seedCache(store);
    const before = cachedQueryCount(store);
    expect(before).toBeGreaterThan(0);

    store.dispatch(setTokens({ access_token: 'a2' }));
    await flush();

    expect(cachedQueryCount(store)).toBe(before);
  });
});
