/**
 * Локальное избранное (массив id листингов) с синхронизацией в localStorage.
 *
 * SSR-safe: при инициализации reducer'а localStorage НЕ читается (на сервере
 * его нет). Гидратация выполняется на клиенте через `hydrateFavorites()` —
 * см. FavoritesHydrator в StoreProvider/layout. Каждое изменение пишется в
 * localStorage внутри редьюсеров (на клиенте).
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const STORAGE_KEY = 'avino.favorites';

export interface FavoritesState {
  ids: string[];
}

const initialState: FavoritesState = { ids: [] };

/** Чтение избранного из localStorage (только на клиенте). */
export function readFavoritesFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Запись избранного в localStorage (только на клиенте). */
function persist(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* приватный режим / переполнение — игнорируем */
  }
}

const favoritesSlice = createSlice({
  name: 'favorites',
  initialState,
  reducers: {
    /** Заменить весь список (используется при гидратации из localStorage). */
    hydrateFavorites(state, action: PayloadAction<string[]>) {
      state.ids = action.payload;
    },
    /** Переключить наличие id в избранном. */
    toggleFavorite(state, action: PayloadAction<string>) {
      const id = action.payload;
      const idx = state.ids.indexOf(id);
      if (idx >= 0) state.ids.splice(idx, 1);
      else state.ids.push(id);
      persist(state.ids);
    },
    /** Добавить id (без дублей). */
    addFavorite(state, action: PayloadAction<string>) {
      if (!state.ids.includes(action.payload)) {
        state.ids.push(action.payload);
        persist(state.ids);
      }
    },
    /** Удалить id. */
    removeFavorite(state, action: PayloadAction<string>) {
      state.ids = state.ids.filter((x) => x !== action.payload);
      persist(state.ids);
    },
    /** Очистить избранное. */
    clearFavorites(state) {
      state.ids = [];
      persist(state.ids);
    },
  },
});

export const {
  hydrateFavorites,
  toggleFavorite,
  addFavorite,
  removeFavorite,
  clearFavorites,
} = favoritesSlice.actions;

export default favoritesSlice.reducer;
