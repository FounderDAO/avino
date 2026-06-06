import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type {
  AdminUserDetail,
  AdminUserFilters,
  AdminUserRow,
  RoleDict,
} from './adminTypes';

/**
 * adminUsersApi (ADMIN-11) — пользователи и справочник ролей (API.md §6).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Read-only часть TASK-130: список, карточка и справочник ролей
 * (источник опций фильтра). Мутации статуса/ролей — ADMIN-12. Все query помечены
 * тегом `Admin`, поэтому ADMIN-12 сможет инвалидировать список/карточку после
 * действий.
 *
 * - `GET /admin/users?status&role&q&page&limit` → page-based
 *   `Paginated<AdminUserRow>` (§6). Auth: ADMIN.
 * - `GET /admin/users/:id` → `AdminUserDetail` (профиль + аудит-таймстемпы).
 * - `GET /roles` → `RoleDict[]` (seeded dictionary без GUEST). Auth: ADMIN/MODERATOR.
 */
export const adminUsersApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAdminUsers: build.query<Paginated<AdminUserRow>, AdminUserFilters>({
      query: (filters) => ({
        url: '/admin/users',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    getAdminUser: build.query<AdminUserDetail, string>({
      query: (id) => ({ url: `/admin/users/${id}` }),
      providesTags: ['Admin'],
    }),

    listRoles: build.query<RoleDict[], void>({
      query: () => ({ url: '/roles' }),
      providesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useListAdminUsersQuery, useGetAdminUserQuery, useListRolesQuery } =
  adminUsersApi;
