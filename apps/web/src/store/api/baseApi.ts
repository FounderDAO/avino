import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/**
 * Единая точка входа RTK Query (CLAUDE.md §4).
 * Все эндпоинты добавляются через baseApi.injectEndpoints в файлах
 * src/store/api/*.ts (authApi, listingsApi, searchApi, ...).
 * Прямые fetch()/axios внутри компонентов запрещены.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/v1`,
  }),
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
