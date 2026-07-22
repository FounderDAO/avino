/**
 * identityResetListener — сброс RTK Query-кэша при смене личности.
 *
 * Регрессия: после logout+login под другим аккаунтом `getMyListings` отдавал
 * закэшированные объявления прежнего пользователя (кэш ключуется по args, не по
 * пользователю). Reset обязан срабатывать на login/logout, но НЕ на ротацию
 * токена (тот же пользователь).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeStore } from './store';
import { setCredentials, clearCredentials } from './slices/authSlice';
import { myListingsApi } from './api/myListingsApi';

/** Дать асинхронному listener-эффекту отработать после dispatch. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const fakeUser = {
  id: 'user-b',
  phone: null,
  email: 'b@example.com',
  default_language: 'RU' as const,
  status: 'ACTIVE' as const,
  roles: ['USER' as const],
  is_phone_verified: true,
};

/** Положить в кэш RTK Query запись getMyListings без обращения к сети. */
async function seedCache(store: ReturnType<typeof makeStore>): Promise<void> {
  await store.dispatch(
    myListingsApi.util.upsertQueryData('getMyListings', undefined, {
      items: [],
      total: 3,
    }),
  );
}

const cachedQueryCount = (store: ReturnType<typeof makeStore>): number =>
  Object.keys(store.getState().api.queries).length;

describe('identityResetListener: сброс кэша при смене личности', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('login (setCredentials с user) очищает кэш прежнего пользователя', async () => {
    const store = makeStore();
    await seedCache(store);
    expect(cachedQueryCount(store)).toBeGreaterThan(0);

    store.dispatch(
      setCredentials({ access_token: 'a', refresh_token: 'r', user: fakeUser }),
    );
    await flush();

    expect(cachedQueryCount(store)).toBe(0);
  });

  it('logout (clearCredentials) очищает кэш', async () => {
    const store = makeStore();
    await seedCache(store);
    expect(cachedQueryCount(store)).toBeGreaterThan(0);

    store.dispatch(clearCredentials());
    await flush();

    expect(cachedQueryCount(store)).toBe(0);
  });

  it('ротация токена (setCredentials без user) НЕ трогает кэш', async () => {
    const store = makeStore();
    await seedCache(store);
    const before = cachedQueryCount(store);
    expect(before).toBeGreaterThan(0);

    store.dispatch(setCredentials({ access_token: 'a2', refresh_token: 'r2' }));
    await flush();

    expect(cachedQueryCount(store)).toBe(before);
  });
});
