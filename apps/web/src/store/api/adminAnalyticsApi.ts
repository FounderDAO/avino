import { adminApi } from './adminApi';
import type { AdminAnalytics } from './adminTypes';

/**
 * adminAnalyticsApi — данные графиков дашборда (API.md §16).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Помечен тегом `Admin`, поэтому графики/лента перечитываются
 * после любой админ-мутации (модерация листинга и т.п.) — все они инвалидируют
 * `Admin`.
 *
 * - `GET /admin/analytics` → `AdminAnalytics` (`listings_over_time`, `buy_rent`,
 *   `by_district`, `recent_activity`). Auth: MODERATOR / ADMIN.
 */
export const adminAnalyticsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminAnalytics: build.query<AdminAnalytics, void>({
      query: () => ({ url: '/admin/analytics' }),
      providesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetAdminAnalyticsQuery } = adminAnalyticsApi;
