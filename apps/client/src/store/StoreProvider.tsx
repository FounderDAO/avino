'use client';

import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './store';
import { hydrateFavorites, readFavoritesFromStorage } from './favoritesSlice';
import { useAppDispatch } from './hooks';
import { SessionBootstrap } from '@/components/SessionBootstrap';

/**
 * Гидратация избранного из localStorage после монтирования на клиенте.
 * На сервере не выполняется — initialState остаётся пустым (нет рассинхрона SSR).
 */
function FavoritesHydrator() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(hydrateFavorites(readFavoritesFromStorage()));
  }, [dispatch]);
  return null;
}

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
  return (
    <Provider store={storeRef.current}>
      <FavoritesHydrator />
      <SessionBootstrap />
      {children}
    </Provider>
  );
}
