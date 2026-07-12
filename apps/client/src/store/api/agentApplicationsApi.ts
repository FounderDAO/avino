import { baseApi } from './baseApi';

/**
 * agentApplicationsApi — заявка «Стать агентом» (API.md §21, ADR-0140).
 *
 * Контракты:
 * - POST /users/me/agent-application → 201 заявка. Анкета-минимум (имя/
 *     телефон/аватар — из профиля); тело `{ agency_name?, about }`.
 *     Ошибки: 400 VALIDATION_ERROR, 409 AGENT_APPLICATION_PENDING (уже есть
 *     заявка на рассмотрении), 409 ALREADY_AGENT (уже AGENT/AGENCY).
 * - GET  /users/me/agent-application → 200 последняя заявка (любой статус),
 *     404 NOT_FOUND если заявок ещё не было. `queryFn` переводит 404 в
 *     `data: null` — precedent в RTK Query-слоях этого проекта отсутствует
 *     (соседи не мапят 404→null на уровне query), поэтому используем
 *     штатный escape hatch RTK Query, а не хендлим 404 отдельно в каждом
 *     компоненте-потребителе (лимит-модалка, /become-agent).
 *
 * snake_case на проводе → camelCase в сторе (зеркалит usersApi/tourRequestsApi).
 */

export type AgentApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Ответ API (snake_case контракт §21). */
interface ApiAgentApplication {
  id: string;
  status: AgentApplicationStatus;
  agency_name: string | null;
  about: string;
  reject_reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Заявка «Стать агентом» — camelCase UI-модель. */
export interface AgentApplication {
  id: string;
  status: AgentApplicationStatus;
  agencyName: string | null;
  about: string;
  rejectReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Тело POST /users/me/agent-application. */
export interface SubmitAgentApplicationBody {
  agencyName?: string;
  about: string;
}

function mapAgentApplication(api: ApiAgentApplication): AgentApplication {
  return {
    id: api.id,
    status: api.status,
    agencyName: api.agency_name,
    about: api.about,
    rejectReason: api.reject_reason,
    createdAt: api.created_at,
    resolvedAt: api.resolved_at,
  };
}

export const agentApplicationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMyAgentApplication: build.query<AgentApplication | null, void>({
      queryFn: async (_arg, _api, _extraOptions, baseQuery) => {
        const result = await baseQuery({ url: '/users/me/agent-application' });
        if (result.error) {
          if (result.error.status === 404) return { data: null };
          return { error: result.error };
        }
        return { data: mapAgentApplication(result.data as ApiAgentApplication) };
      },
      providesTags: ['AgentApplication'],
    }),

    submitAgentApplication: build.mutation<AgentApplication, SubmitAgentApplicationBody>({
      query: ({ agencyName, about }) => ({
        url: '/users/me/agent-application',
        method: 'POST',
        body: { agency_name: agencyName ?? null, about },
      }),
      transformResponse: (response: ApiAgentApplication) => mapAgentApplication(response),
      invalidatesTags: ['AgentApplication'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetMyAgentApplicationQuery, useSubmitAgentApplicationMutation } =
  agentApplicationsApi;
