'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './store';
import { initializeAuth } from './slices/authSlice';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
    // Гидрация refresh-токена из localStorage при старте (ADMIN-04).
    storeRef.current.dispatch(initializeAuth());
  }
  return <Provider store={storeRef.current}>{children}</Provider>;
}
