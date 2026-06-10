import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type {
  AdminUserDetail,
  AdminUserFilters,
  AdminUserRow,
  AssignRoleRequest,
  RoleCode,
  RoleDict,
  UpdateAdminUserStatusRequest,
} from './adminTypes';

/**
 * adminUsersApi (ADMIN-11/12) — пользователи, роли и управление ими (API.md §6).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Все query помечены тегом `Admin`; мутации (ADMIN-12)
 * инвалидируют `Admin`, поэтому список и карточка перечитываются после действия.
 *
 * Чтение (ADMIN-11):
 * - `GET /admin/users?status&role&q&page&limit` → page-based
 *   `Paginated<AdminUserRow>` (§6). Auth: ADMIN.
 * - `GET /admin/users/:id` → `AdminUserDetail` (профиль + аудит-таймстемпы).
 * - `GET /roles` → `RoleDict[]` (seeded dictionary без GUEST). Auth: ADMIN/MODERATOR.
 *
 * Мутации (ADMIN-12) — все возвращают свежую карточку, кроме DELETE:
 * - `PATCH /admin/users/:id` `{ status, reason? }` → `AdminUserDetail`. Смена
 *   статуса (ACTIVE/BLOCKED/DELETED); аудит `ADMIN_USER_UPDATE`.
 * - `POST /admin/users/:id/roles` `{ role }` → `AdminUserDetail` (`201`).
 *   Ошибки: `409 ROLE_ALREADY_GRANTED`, `400` (GUEST), `404`.
 * - `DELETE /admin/users/:id/roles/:role` → `204`. Ошибки: `404` (нет роли).
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

    getRoles: build.query<RoleDict[], void>({
      query: () => ({ url: '/roles' }),
      providesTags: ['Admin'],
    }),

    updateAdminUserStatus: build.mutation<
      AdminUserDetail,
      { id: string; body: UpdateAdminUserStatusRequest }
    >({
      query: ({ id, body }) => ({
        url: `/admin/users/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),

    assignAdminUserRole: build.mutation<
      AdminUserDetail,
      { id: string; body: AssignRoleRequest }
    >({
      query: ({ id, body }) => ({
        url: `/admin/users/${id}/roles`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),

    removeAdminUserRole: build.mutation<void, { id: string; role: RoleCode }>({
      query: ({ id, role }) => ({
        url: `/admin/users/${id}/roles/${role}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAdminUsersQuery,
  useGetAdminUserQuery,
  useGetRolesQuery,
  useUpdateAdminUserStatusMutation,
  useAssignAdminUserRoleMutation,
  useRemoveAdminUserRoleMutation,
} = adminUsersApi;
