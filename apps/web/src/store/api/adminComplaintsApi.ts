import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type { Complaint, ComplaintFilters, ComplaintStatus } from './adminTypes';

/**
 * adminComplaintsApi (ADMIN-10) — жалобы на листинги (API.md §16).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Список помечен тегом `Admin`; смена статуса инвалидирует
 * `Admin`, поэтому список перечитывается после обработки жалобы (acceptance
 * ADMIN-10: «список и обработка жалоб работают»).
 *
 * - `GET /admin/complaints?status&listing_id&page&limit` → page-based
 *   `Paginated<Complaint>` (§16). Auth: MODERATOR / ADMIN.
 * - `PATCH /admin/complaints/:id` `{ status }` → обновлённая `Complaint`
 *   (бэкенд проставляет `handled_by`/`handled_at`).
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

    updateComplaintStatus: build.mutation<
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

export const { useListAdminComplaintsQuery, useUpdateComplaintStatusMutation } =
  adminComplaintsApi;
