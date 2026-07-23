/**
 * SessionBootstrap — определение сессии пробным silent-refresh (ADR-0153,
 * TASK-256 PR-2).
 *
 * Сетевой контракт refresh (без тела → set access → retry) покрыт
 * `baseQuery.test.ts`; здесь — собственная логика компонента поверх мокнутых
 * хуков authApi: пробный refresh ровно один раз на монтирование, gate GET
 * /auth/me до authenticated, и 401 → гость (clearCredentials). Реальный RTK-
 * thunk в jsdom спотыкается об undici-AbortSignal, поэтому хуки мокаем.
 */
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeStore } from '@/store/store';
import { selectAuthStatus } from '@/store/slices/authSlice';

const hoisted = vi.hoisted(() => ({
  refreshCalls: 0,
  outcome: 'ok' as 'ok' | 'fail',
  getMeSkips: [] as (boolean | undefined)[],
}));

vi.mock('@/store/api/authApi', () => ({
  useRefreshMutation: () => [
    () => {
      hoisted.refreshCalls += 1;
      return {
        unwrap: () =>
          hoisted.outcome === 'ok'
            ? Promise.resolve({ access_token: 'boot-access' })
            : Promise.reject(new Error('401')),
      };
    },
  ],
  useGetMeQuery: (_arg: unknown, opts?: { skip?: boolean }) => {
    hoisted.getMeSkips.push(opts?.skip);
    return { data: undefined };
  },
}));

import { SessionBootstrap } from './SessionBootstrap';

describe('SessionBootstrap: пробный silent-refresh на старте', () => {
  beforeEach(() => {
    hoisted.refreshCalls = 0;
    hoisted.outcome = 'ok';
    hoisted.getMeSkips = [];
  });

  it('дёргает refresh ровно один раз, а GET /auth/me ждёт authenticated (skip в idle)', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <SessionBootstrap />
      </Provider>,
    );
    expect(hoisted.refreshCalls).toBe(1);
    // На первом рендере статус ещё idle → getMe должен быть skip'нут.
    expect(hoisted.getMeSkips[0]).toBe(true);
  });

  it('401 (нет cookie) → unauthenticated (гость)', async () => {
    hoisted.outcome = 'fail';
    const store = makeStore();
    render(
      <Provider store={store}>
        <SessionBootstrap />
      </Provider>,
    );
    await waitFor(() =>
      expect(selectAuthStatus(store.getState())).toBe('unauthenticated'),
    );
  });
});
