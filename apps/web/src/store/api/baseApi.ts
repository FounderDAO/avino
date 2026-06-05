import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

/**
 * Единая точка входа RTK Query (CLAUDE.md §4).
 * Все эндпоинты добавляются через baseApi.injectEndpoints в файлах
 * src/store/api/*.ts (authApi, listingsApi, searchApi, ...).
 * Прямые fetch()/axios внутри компонентов запрещены.
 *
 * baseQuery — baseQueryWithReauth (ADMIN-04): Bearer + авто-refresh на 401.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    'Auth',
    'Listing',
    'Search',
    'SavedSearch',
    'Favorite',
    'Chat',
    'Notification',
    'User',
    'Admin',
  ],
  endpoints: () => ({}),
});
