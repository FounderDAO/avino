import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type { AdminListingRow, AdminListingFilters } from './adminTypes';

/**
 * adminListingsApi (ADMIN-08) — очередь модерации листингов (API.md §16).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Бизнес-эндпоинты карточки/действий (`PATCH .../status`,
 * `.../moderation-logs`) добавит ADMIN-09 в этот же файл.
 *
 * - GET /api/v1/admin/listings?status&property_type&transaction_type&q&page&limit
 *   → page-based `Paginated<AdminListingRow>` (`meta.total` обязателен, §4).
 *   Пустые фильтры отбрасываются `toQueryParams` (forward-compatible, §4).
 */
export const adminListingsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAdminListings: build.query<
      Paginated<AdminListingRow>,
      AdminListingFilters
    >({
      query: (filters) => ({
        url: '/admin/listings',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useListAdminListingsQuery } = adminListingsApi;
