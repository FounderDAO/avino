/**
 * authSlice — модель хранения токенов после ADR-0153 (TASK-256 PR-2).
 *
 * refresh больше НЕ в JS: он в httpOnly cookie `avino_rt`, невидимой скрипту.
 * Поэтому store при создании стартует в `idle` (сессия не определена) — статус
 * поднимает пробный silent-refresh из cookie (SessionBootstrap), а не чтение
 * localStorage. access — по-прежнему только в памяти (ADR-0142). Легаси-ключи
 * токенов вычищаются при создании store (миграция).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeStore } from '../store';
import {
  setCredentials,
  clearCredentials,
  selectAccessToken,
  selectAuthResolved,
  selectAuthStatus,
  selectIsAuthenticated,
} from './authSlice';

const LEGACY_ACCESS_KEY = 'avino.client.access_token';
const LEGACY_REFRESH_KEY = 'avino.client.refresh_token';

describe('authSlice: определение сессии (cookie-модель, ADR-0153)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('новый store стартует в idle — сессия ещё не определена', () => {
    const store = makeStore();
    expect(selectAuthStatus(store.getState())).toBe('idle');
    expect(selectAuthResolved(store.getState())).toBe(false);
    expect(selectIsAuthenticated(store.getState())).toBe(false);
  });

  it('setCredentials переводит в authenticated и кладёт access в память', () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'access-1' }));
    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(selectAuthResolved(store.getState())).toBe(true);
    expect(selectAccessToken(store.getState())).toBe('access-1');
  });

  it('access не пишется в localStorage и не переживает пересоздание store', () => {
    const store1 = makeStore();
    store1.dispatch(setCredentials({ access_token: 'access-1', user: null }));
    expect(window.localStorage.getItem(LEGACY_ACCESS_KEY)).toBeNull();

    // Новый store (напр. смена локали) НЕ знает про сессию синхронно: refresh в
    // cookie, а не в JS. Статус idle, пока бутстрап не сделает silent-refresh.
    const store2 = makeStore();
    expect(selectAuthStatus(store2.getState())).toBe('idle');
    expect(selectAccessToken(store2.getState())).toBeNull();
  });

  it('clearCredentials переводит в unauthenticated (resolved гость)', () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'access-1' }));
    store.dispatch(clearCredentials());
    expect(selectAuthStatus(store.getState())).toBe('unauthenticated');
    expect(selectAuthResolved(store.getState())).toBe(true);
    expect(selectIsAuthenticated(store.getState())).toBe(false);
  });

  it('легаси-токены в localStorage (до ADR-0142/0153) вычищаются при создании store', () => {
    window.localStorage.setItem(LEGACY_ACCESS_KEY, 'stale-access');
    window.localStorage.setItem(LEGACY_REFRESH_KEY, 'stale-refresh');
    makeStore();
    expect(window.localStorage.getItem(LEGACY_ACCESS_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
  });
});
