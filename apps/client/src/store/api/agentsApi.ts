/**
 * agentsApi — клиентская дозагрузка каталога агентов (API.md §21, ADR-0140).
 *
 * Первую страницу /agents отдаёт SSR (`getAgents` в lib/api/agents.ts),
 * следующие клиент дотягивает по кнопке «Показать ещё» — тот же приём, что у
 * выдачи /search (searchApi.searchPage, TASK-199). Каталог публичный, поэтому
 * авторизация не требуется, но baseQuery всё равно подставит токен, если он есть.
 */
import { baseApi } from './baseApi';
import { mapAgent, type Agent, type ApiAgent } from '@/lib/api/agents';

/** Envelope GET /agents (постраничный список, §21). */
interface ApiAgentsEnvelope {
  data: ApiAgent[];
  meta: { page: number; limit: number; total: number };
}

/** Аргументы дозагрузки страницы каталога. */
export interface AgentsPageArgs {
  page: number;
  limit: number;
}

/** Страница каталога в UI-модели. */
export interface AgentsPageResult {
  agents: Agent[];
  total: number;
}

export const agentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Следующая страница каталога агентов (lazy: дёргается кнопкой). */
    agentsPage: build.query<AgentsPageResult, AgentsPageArgs>({
      query: ({ page, limit }) => `/agents?limit=${limit}&page=${page}`,
      transformResponse: (env: ApiAgentsEnvelope): AgentsPageResult => ({
        agents: env.data.map(mapAgent),
        total: env.meta.total,
      }),
      providesTags: ['Agent'],
    }),
  }),
  overrideExisting: false,
});

export const { useLazyAgentsPageQuery } = agentsApi;
