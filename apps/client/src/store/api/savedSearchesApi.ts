/**
 * savedSearchesApi — сохранённые поиски (docs/API.md §12).
 *
 * Все эндпоинты — Bearer-only (гость получит 401), поэтому потребители
 * обязаны передавать `{ skip: !isAuthenticated }` в useGetSavedSearchesQuery.
 *
 * `filters_json` оборачивает внутренний объект фильтров в конверт версии схемы:
 *   { schemaVersion: 1, filters: { transaction_type, property_type, ... } }.
 * Внутренние ключи совпадают с параметрами GET /search (см. lib/savedSearch.ts).
 */
import { baseApi } from './baseApi';
import type { SavedSearchFilters } from '@/lib/savedSearch';

/** Текущая версия схемы фильтров (контракт API.md §12). */
export const SAVED_SEARCH_SCHEMA_VERSION = 1 as const;

/** Конверт фильтров с версией схемы. */
export interface FiltersJson {
  schemaVersion: number;
  filters: SavedSearchFilters;
}

/** Сохранённый поиск (форма ответа API.md §12). */
export interface SavedSearch {
  id: string;
  name: string;
  is_active: boolean;
  filters_json: FiltersJson;
  last_checked_at: string | null;
  created_at: string;
}

/** Envelope GET /saved-searches. */
interface SavedSearchesEnvelope {
  data: SavedSearch[];
  meta: { limit: number; total: number };
}

/** Аргумент создания: имя + внутренний объект фильтров. */
export interface CreateSavedSearchArg {
  name: string;
  filters: SavedSearchFilters;
}

/** Аргумент обновления: id + любое подмножество изменяемых полей. */
export interface UpdateSavedSearchArg {
  id: string;
  name?: string;
  is_active?: boolean;
  filters_json?: FiltersJson;
}

export const savedSearchesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Список сохранённых поисков. GET /saved-searches?limit=50. */
    getSavedSearches: build.query<SavedSearch[], void>({
      query: () => '/saved-searches?limit=50',
      transformResponse: (env: SavedSearchesEnvelope) => env.data,
      providesTags: ['SavedSearch'],
    }),

    /** Создать поиск. POST /saved-searches → 201. */
    createSavedSearch: build.mutation<SavedSearch, CreateSavedSearchArg>({
      query: ({ name, filters }) => ({
        url: '/saved-searches',
        method: 'POST',
        body: {
          name,
          filters_json: {
            schemaVersion: SAVED_SEARCH_SCHEMA_VERSION,
            filters,
          },
        },
      }),
      invalidatesTags: ['SavedSearch'],
    }),

    /** Частичное обновление. PATCH /saved-searches/:id → 200. */
    updateSavedSearch: build.mutation<SavedSearch, UpdateSavedSearchArg>({
      query: ({ id, ...patch }) => ({
        url: `/saved-searches/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: ['SavedSearch'],
    }),

    /** Удалить поиск. DELETE /saved-searches/:id → 204. */
    deleteSavedSearch: build.mutation<void, string>({
      query: (id) => ({
        url: `/saved-searches/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['SavedSearch'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetSavedSearchesQuery,
  useCreateSavedSearchMutation,
  useUpdateSavedSearchMutation,
  useDeleteSavedSearchMutation,
} = savedSearchesApi;
