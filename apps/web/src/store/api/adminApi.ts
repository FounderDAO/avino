import { baseApi } from './baseApi';

/**
 * adminApi (ADMIN-07) — база RTK Query для админ-панели.
 *
 * Это точка инъекции эндпоинтов админки (CLAUDE.md §4: только RTK Query).
 * Сами эндпоинты добавляют последующие задачи в этот же объект через
 * `adminApi.injectEndpoints(...)`:
 *   - ADMIN-08/09  очередь и карточка модерации (`/admin/listings*`)
 *   - ADMIN-10     жалобы (`/admin/complaints*`)
 *   - ADMIN-11/12  пользователи и роли (`/admin/users*`, `/roles`)
 *   - ADMIN-13     промо (`/admin/listings/:id/promotions`, `/admin/listing-promotions/*`)
 *   - ADMIN-14     логи (`/admin/*-logs`)
 *
 * Шаблон добавления эндпоинта (в отдельном файле или ниже):
 *
 *   import { adminApi } from './adminApi';
 *   import type { Paginated, AdminListingRow, AdminListingFilters } from './adminApi';
 *
 *   export const adminListingsApi = adminApi.injectEndpoints({
 *     endpoints: (build) => ({
 *       listAdminListings: build.query<Paginated<AdminListingRow>, AdminListingFilters>({
 *         query: (filters) => ({ url: '/admin/listings', params: toQueryParams(filters) }),
 *         providesTags: ['Admin'],
 *       }),
 *     }),
 *   });
 *   export const { useListAdminListingsQuery } = adminListingsApi;
 *
 * Тег кэша `Admin` уже объявлен в `baseApi.tagTypes`. Все ответы snake_case,
 * коллекции — в `Paginated<T>` (см. `./pagination`).
 */
export const adminApi = baseApi.injectEndpoints({
  endpoints: () => ({}),
  overrideExisting: false,
});

// Единый импорт-сурфейс для задач ADMIN-08..15.
export * from './pagination';
export * from './adminTypes';
