import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { makeStore } from './store';
import { setCredentials } from './slices/authSlice';
import { useRealtimeBridge } from './useRealtimeBridge';
import { baseApi } from './api/baseApi';
import * as client from './socketClient';

vi.mock('./socketClient');

function wrapper(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
}

describe('useRealtimeBridge', () => {
  it('подключается при наличии токена', () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'tok', refresh_token: 'r' }));
    const connect = vi.spyOn(client, 'connectSocket');
    renderHook(() => useRealtimeBridge(), { wrapper: wrapper(store) });
    expect(connect).toHaveBeenCalledWith(expect.any(String), 'tok', expect.any(Object));
  });

  it('не подключается без токена', () => {
    const store = makeStore();
    const connect = vi.spyOn(client, 'connectSocket');
    renderHook(() => useRealtimeBridge(), { wrapper: wrapper(store) });
    expect(connect).not.toHaveBeenCalled();
  });

  it('onInvalidate диспатчит invalidateTags по маппингу', () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'tok', refresh_token: 'r' }));
    let captured: (p: unknown) => void = () => {};
    vi.spyOn(client, 'connectSocket').mockImplementation((_u, _t, h) => {
      captured = h.onInvalidate as (p: unknown) => void;
    });
    const originalInvalidateTags = baseApi.util.invalidateTags;
    const invalidateTagsSpy = vi.spyOn(baseApi.util, 'invalidateTags');
    // RTK-мидлвара инвалидации зовёт api.util.invalidateTags.match(action) —
    // vi.spyOn не копирует статический .match с action-creator'а, восстанавливаем.
    Object.assign(invalidateTagsSpy, { match: originalInvalidateTags.match });
    renderHook(() => useRealtimeBridge(), { wrapper: wrapper(store) });
    captured({ type: 'notification' });
    // invalidateTags(['Notification']) уходит thunk'ом в dispatch по маппингу
    expect(invalidateTagsSpy).toHaveBeenCalledWith(['Notification']);
  });
});
