import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type { AgentApplication, AgentApplicationFilters } from './adminTypes';

/**
 * adminAgentApplicationsApi — заявки «Стать агентом» (API.md §21, ADR-0140).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query). Query помечен
 * тегом `Admin`; мутации инвалидируют `Admin` — список перечитывается после
 * решения по заявке.
 *
 * - `GET /admin/agent-applications?status&page&limit` → page-based
 *   `Paginated<AgentApplication>`. Auth: MODERATOR/ADMIN.
 * - `POST /admin/agent-applications/:id/approve` — без тела; транзакция на
 *   бэкенде выдаёт роль AGENT + уведомление заявителю.
 * - `POST /admin/agent-applications/:id/reject` `{ reason? }` — причина
 *   опциональна (≤2000 симв.); пустую строку не шлём.
 * Не-PENDING заявка → `422 INVALID_STATUS_TRANSITION` (§17).
 */
export const adminAgentApplicationsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAdminAgentApplications: build.query<
      Paginated<AgentApplication>,
      AgentApplicationFilters
    >({
      query: (filters) => ({
        url: '/admin/agent-applications',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    approveAgentApplication: build.mutation<AgentApplication, string>({
      query: (id) => ({
        url: `/admin/agent-applications/${id}/approve`,
        method: 'POST',
      }),
      invalidatesTags: ['Admin'],
    }),

    rejectAgentApplication: build.mutation<
      AgentApplication,
      { id: string; reason?: string }
    >({
      query: ({ id, reason }) => ({
        url: `/admin/agent-applications/${id}/reject`,
        method: 'POST',
        body: reason && reason.trim() ? { reason: reason.trim() } : {},
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAdminAgentApplicationsQuery,
  useApproveAgentApplicationMutation,
  useRejectAgentApplicationMutation,
} = adminAgentApplicationsApi;
