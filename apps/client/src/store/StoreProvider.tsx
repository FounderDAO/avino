'use client';

import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { makeStore, type AppStore } from './store';
import { hydrateFavorites, readFavoritesFromStorage } from './favoritesSlice';
import { hydrateCurrency, readCurrencyFromStorage } from './currencySlice';
import { useAppDispatch } from './hooks';
import { SessionBootstrap } from '@/components/SessionBootstrap';
import { LegalConsentGate } from '@/components/LegalConsentGate';
import { ApiErrorToasts } from '@/components/ApiErrorToasts';

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
 * Гидратация предпочтения валюты из localStorage после монтирования на клиенте.
 * На сервере не выполняется — initialState остаётся 'UZS' (нет рассинхрона SSR).
 */
function CurrencyHydrator() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(hydrateCurrency(readCurrencyFromStorage()));
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
      <CurrencyHydrator />
      <SessionBootstrap />
      <LegalConsentGate />
      <ApiErrorToasts />
      {/* Тосты выше модалок (z-[81] у Dialog) — иначе фидбэк из модалки не виден. */}
      <Toaster
        position="top-center"
        duration={4000}
        className="!z-[90]"
        toastOptions={{
          classNames: {
            toast:
              '!rounded-[14px] !border-border !bg-surface !text-ink !shadow-raised !text-[13.5px] !font-semibold',
            success: '[&_[data-icon]]:!text-teal',
            error: '[&_[data-icon]]:!text-red',
          },
        }}
      />
      {children}
    </Provider>
  );
}
