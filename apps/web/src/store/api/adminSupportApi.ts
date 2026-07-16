import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type { SupportRequest, SupportRequestFilters, SupportRequestStatus } from './adminTypes';

/**
 * adminSupportApi — обращения в поддержку с формы /help.
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query). Query помечены
 * тегом `Admin`; мутация инвалидирует `Admin` → список перечитывается после
 * обработки обращения.
 *
 * - `GET /admin/support/requests?status&page&limit` → `Paginated<SupportRequest>`.
 * - `PATCH /admin/support/requests/:id` `{ status }` → свежий `SupportRequest`;
 *   `handled_by`/`handled_at` проставляет сервер.
 */
export const adminSupportApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAdminSupportRequests: build.query<Paginated<SupportRequest>, SupportRequestFilters>({
      query: (filters) => ({
        url: '/admin/support/requests',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    updateAdminSupportRequestStatus: build.mutation<
      SupportRequest,
      { id: string; status: SupportRequestStatus }
    >({
      query: ({ id, status }) => ({
        url: `/admin/support/requests/${id}`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAdminSupportRequestsQuery,
  useUpdateAdminSupportRequestStatusMutation,
} = adminSupportApi;
