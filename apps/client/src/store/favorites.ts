/**
 * Типизированные хуки избранного — auth-aware фасад.
 *
 * - Гость: источник истины — localStorage-слайс `favoritesSlice` (id'шники).
 * - Авторизован: источник истины — серверное избранное `favoritesApi`
 *   (GET /favorites), мутации add/remove идут на бэк.
 *
 * Сигнатуры публичных хуков НЕ меняются — потребители (PropertyCard,
 * ContactCard, бейдж шапки, account/Favorites) работают как раньше.
 *
 * TODO(fav-merge-on-login): мердж локального (гостевого) избранного с
 * серверным при логине — вне scope этой задачи.
 */
'use client';

import { useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { toggleFavorite } from './favoritesSlice';
import { selectIsAuthenticated } from './slices/authSlice';
import {
  useGetFavoritesQuery,
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from './api/favoritesApi';
import type { RootState } from './store';

/**
 * Внутренний хук: набор id избранного из активного источника.
 * Авторизован → из серверного GET /favorites (query пропускается для гостей,
 * чтобы не дёргать защищённый эндпоинт и не получить 401).
 * Гость → из localStorage-слайса.
 */
function useFavoriteIds(): string[] {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const guestIds = useAppSelector((s: RootState) => s.favorites.ids);

  const { data: serverItems } = useGetFavoritesQuery(undefined, {
    skip: !isAuthenticated,
  });

  return useMemo(() => {
    if (isAuthenticated) {
      return serverItems?.map((l) => l.id) ?? [];
    }
    return guestIds;
  }, [isAuthenticated, serverItems, guestIds]);
}

/** Список id избранного. */
export function useFavorites(): string[] {
  return useFavoriteIds();
}

/** Признак «в избранном» для конкретного листинга. */
export function useIsFavorite(id: string): boolean {
  const ids = useFavoriteIds();
  return ids.includes(id);
}

/** Кол-во избранного (для бейджа в шапке). */
export function useFavoritesCount(): number {
  return useFavoriteIds().length;
}

/** Функция-переключатель избранного для листинга. */
export function useToggleFavorite(): (id: string) => void {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const ids = useFavoriteIds();
  const [addFavorite] = useAddFavoriteMutation();
  const [removeFavorite] = useRemoveFavoriteMutation();

  return useCallback(
    (id: string) => {
      if (isAuthenticated) {
        // Fire-and-forget: тэг 'Favorite' инвалидируется мутацией,
        // список перезагрузится сам. 409 ALREADY_FAVORITED уже трактуется
        // как успех внутри addFavorite.
        if (ids.includes(id)) {
          void removeFavorite(id);
        } else {
          void addFavorite(id);
        }
        return;
      }
      dispatch(toggleFavorite(id));
    },
    [isAuthenticated, ids, addFavorite, removeFavorite, dispatch],
  );
}
