import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type { Complaint, ComplaintFilters, ComplaintStatus } from './adminTypes';

/**
 * adminComplaintsApi (ADMIN-10) — жалобы на объявления (API.md §16).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Query помечены тегом `Admin`; мутация инвалидирует `Admin`,
 * поэтому список, KPI «Жалобы» на дашборде и бейдж сайдбара перечитываются
 * после обработки жалобы.
 *
 * - `GET /admin/complaints?status&listing_id&page&limit` → page-based
 *   `Paginated<Complaint>` (§16). Auth: MODERATOR/ADMIN.
 * - `PATCH /admin/complaints/:id` `{ status }` → свежая `Complaint`;
 *   `handled_by`/`handled_at` проставляет сервер (модератор из токена).
 */
export const adminComplaintsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAdminComplaints: build.query<Paginated<Complaint>, ComplaintFilters>({
      query: (filters) => ({
        url: '/admin/complaints',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    updateAdminComplaintStatus: build.mutation<
      Complaint,
      { id: string; status: ComplaintStatus }
    >({
      query: ({ id, status }) => ({
        url: `/admin/complaints/${id}`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAdminComplaintsQuery,
  useUpdateAdminComplaintStatusMutation,
} = adminComplaintsApi;
