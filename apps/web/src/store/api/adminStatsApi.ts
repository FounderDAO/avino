import { adminApi } from './adminApi';
import type { AdminStats } from './adminTypes';

/**
 * adminStatsApi (ADMIN-15) — сводные счётчики дашборда (API.md §16).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Помечен тегом `Admin`, поэтому счётчики перечитываются после
 * любой админ-мутации (модерация листинга, обработка жалобы, смена статуса
 * пользователя, активация/отмена промо) — все они инвалидируют `Admin`.
 *
 * - `GET /admin/stats` → `AdminStats` (`listings_new`, `complaints_new`,
 *   `users_total`, `promotions_active`). Auth: MODERATOR / ADMIN.
 */
export const adminStatsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getAdminStats: build.query<AdminStats, void>({
      query: () => ({ url: '/admin/stats' }),
      providesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetAdminStatsQuery } = adminStatsApi;
