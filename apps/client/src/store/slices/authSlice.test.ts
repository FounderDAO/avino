/**
 * authSlice — гидрация из localStorage при пересоздании store.
 *
 * Смена локали ремонтирует [locale]/layout → StoreProvider создаёт НОВЫЙ
 * store (useRef сбрасывается). Авторизация, полученная после загрузки
 * страницы (логин через модалку), обязана пережить пересоздание: initialState
 * должен читать localStorage при создании store, а не один раз при загрузке
 * модуля.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeStore } from '../store';
import {
  setCredentials,
  clearCredentials,
  selectIsAuthenticated,
} from './authSlice';

describe('authSlice: пересоздание store (ремонт при смене локали)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('логин после загрузки страницы переживает пересоздание store', () => {
    // Страница загружена гостем — store №1 без кредов.
    const store1 = makeStore();
    expect(selectIsAuthenticated(store1.getState())).toBe(false);

    // Логин через модалку — креды в store №1 и localStorage.
    store1.dispatch(
      setCredentials({ access_token: 'access-1', refresh_token: 'refresh-1' }),
    );
    expect(selectIsAuthenticated(store1.getState())).toBe(true);

    // Смена локали → новый store обязан подхватить креды из localStorage.
    const store2 = makeStore();
    expect(selectIsAuthenticated(store2.getState())).toBe(true);
  });

  it('логаут переживает пересоздание store (старые токены не воскресают)', () => {
    const store1 = makeStore();
    store1.dispatch(
      setCredentials({ access_token: 'access-1', refresh_token: 'refresh-1' }),
    );
    store1.dispatch(clearCredentials());

    const store2 = makeStore();
    expect(selectIsAuthenticated(store2.getState())).toBe(false);
  });
});

describe('authSlice: access-токен только в памяти (ADR-0142)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('access не попадает в localStorage и не переживает пересоздание store', () => {
    const store1 = makeStore();
    store1.dispatch(
      setCredentials({ access_token: 'access-1', refresh_token: 'refresh-1' }),
    );
    expect(window.localStorage.getItem('avino.client.access_token')).toBeNull();

    // Новый store: авторизован (по refresh), но access восстановится только
    // через ротацию — в state его быть не должно.
    const store2 = makeStore();
    expect(selectIsAuthenticated(store2.getState())).toBe(true);
    expect(store2.getState().auth.accessToken).toBeNull();
    expect(store2.getState().auth.refreshToken).toBe('refresh-1');
  });

  it('легаси access-токен (код до ADR-0142) вычищается при создании store', () => {
    window.localStorage.setItem('avino.client.access_token', 'stale-access');
    makeStore();
    expect(window.localStorage.getItem('avino.client.access_token')).toBeNull();
  });
});
