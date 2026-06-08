'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './store';

/**
 * Redux/RTK Query Provider публичного портала.
 *
 * Store создаётся один раз на клиента через useRef, чтобы каждый SSR-запрос
 * получал свежий store, а на клиенте store не пересоздавался при ре-рендерах.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }
  return <Provider store={storeRef.current}>{children}</Provider>;
}
