/**
 * Типизированные хуки избранного — удобная обёртка над favoritesSlice.
 * 'use client' нужен потребителям; сами хуки безопасны для SSR (читают только store).
 */
'use client';

import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { toggleFavorite } from './favoritesSlice';
import type { RootState } from './store';

/** Список id избранного. */
export function useFavorites(): string[] {
  return useAppSelector((s: RootState) => s.favorites.ids);
}

/** Признак «в избранном» для конкретного листинга. */
export function useIsFavorite(id: string): boolean {
  return useAppSelector((s: RootState) => s.favorites.ids.includes(id));
}

/** Кол-во избранного (для бейджа в шапке). */
export function useFavoritesCount(): number {
  return useAppSelector((s: RootState) => s.favorites.ids.length);
}

/** Функция-переключатель избранного для листинга. */
export function useToggleFavorite(): (id: string) => void {
  const dispatch = useAppDispatch();
  return useCallback((id: string) => dispatch(toggleFavorite(id)), [dispatch]);
}
