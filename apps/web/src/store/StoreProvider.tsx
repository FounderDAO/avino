'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './store';
import { AdminSessionBootstrap } from '@/components/admin/AdminSessionBootstrap';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }
  return (
    <Provider store={storeRef.current}>
      {/* Пробный silent-refresh по cookie определяет сессию (ADR-0153). */}
      <AdminSessionBootstrap />
      {children}
    </Provider>
  );
}
