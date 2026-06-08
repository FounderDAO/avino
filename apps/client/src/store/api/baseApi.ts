import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';

/**
 * Единая точка входа RTK Query публичного портала (CLAUDE.md §4).
 *
 * Все эндпоинты добавляются через `baseApi.injectEndpoints` в файлах
 * `src/store/api/*.ts` (authApi, listingsApi, searchApi, favoritesApi,
 * savedSearchesApi, chatApi, notificationsApi, ...).
 *
 * Прямые fetch()/axios внутри компонентов запрещены — только RTK Query.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: [
    'Auth',
    'Listing',
    'Search',
    'SavedSearch',
    'Favorite',
    'Chat',
    'Notification',
    'User',
  ],
  endpoints: () => ({}),
});
