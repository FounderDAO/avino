/**
 * authSlice (admin) — модель хранения токенов после ADR-0153 (TASK-256 PR-3).
 *
 * refresh больше НЕ в JS: он в httpOnly cookie `avino_rt`. Store при создании
 * стартует в `idle` (сессия не определена) — статус поднимает пробный silent-
 * refresh (AdminSessionBootstrap), а не чтение localStorage. access — только в
 * памяти. Тесты идут в node-env (без window), authSlice это учитывает.
 */
import { describe, expect, it } from 'vitest';
import { makeStore } from '../store';
import {
  setCredentials,
  setTokens,
  logOut,
  selectAccessToken,
  selectAuthResolved,
  selectAuthStatus,
  selectIsAuthenticated,
} from './authSlice';

describe('authSlice (admin): определение сессии (cookie-модель, ADR-0153)', () => {
  it('новый store стартует в idle — сессия ещё не определена', () => {
    const store = makeStore();
    expect(selectAuthStatus(store.getState())).toBe('idle');
    expect(selectAuthResolved(store.getState())).toBe(false);
    expect(selectIsAuthenticated(store.getState())).toBe(false);
  });

  it('setCredentials (логин) → authenticated + access в памяти', () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'access-1' }));
    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(selectAuthResolved(store.getState())).toBe(true);
    expect(selectAccessToken(store.getState())).toBe('access-1');
  });

  it('setTokens (ротация/бутстрап) → authenticated, обновляет access', () => {
    const store = makeStore();
    store.dispatch(setTokens({ access_token: 'access-2' }));
    expect(selectAuthStatus(store.getState())).toBe('authenticated');
    expect(selectAccessToken(store.getState())).toBe('access-2');
  });

  it('logOut → unauthenticated (resolved гость), access очищен', () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'access-1' }));
    store.dispatch(logOut());
    expect(selectAuthStatus(store.getState())).toBe('unauthenticated');
    expect(selectAuthResolved(store.getState())).toBe(true);
    expect(selectIsAuthenticated(store.getState())).toBe(false);
    expect(selectAccessToken(store.getState())).toBeNull();
  });
});
