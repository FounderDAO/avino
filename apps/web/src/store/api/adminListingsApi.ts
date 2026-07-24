import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type {
  AdminListingRow,
  AdminListingFilters,
  AdminListingOwner,
  ListingDetail,
  ListingModerationLogEntry,
  ModerateListingRequest,
  ModerationResult,
  ListingTranslations,
  GenerateTranslationsResult,
  TranslationEditRequest,
  UpdateOriginalRequest,
} from './adminTypes';

/**
 * adminListingsApi (ADMIN-08/09) — модерация листингов (API.md §7/§16).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Все query-эндпоинты помечены тегом `Admin`; мутация статуса
 * инвалидирует `Admin`, поэтому очередь, карточка и история перечитываются
 * после действия (требование ADMIN-09 «инвалидация кэша списка»).
 *
 * - `GET /admin/listings?status&property_type&transaction_type&q&page&limit`
 *   → page-based `Paginated<AdminListingRow>` (ADMIN-08).
 * - `GET /listings/:id` → `ListingDetail`. Карточка для модерации: бэкенд отдаёт
 *   непубличные статусы MODERATOR/ADMIN через тот же публичный роут
 *   (`OptionalJwtAuthGuard`); Bearer ставит `baseQuery`. `DELETED` → `404`.
 * - `GET /admin/listings/:id/moderation-logs` → история (свежие сверху).
 * - `PATCH /admin/listings/:id/status` `{ action, reason? }` → `ModerationResult`.
 */
export const adminListingsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAdminListings: build.query<
      Paginated<AdminListingRow>,
      AdminListingFilters
    >({
      query: (filters) => ({
        url: '/admin/listings',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    getAdminListing: build.query<ListingDetail, string>({
      query: (id) => ({ url: `/listings/${id}` }),
      providesTags: ['Admin'],
    }),

    /**
     * `GET /admin/listings/:id/owner` → инлайн-профиль автора (LOG.md #6).
     * Публичный `GET /listings/:id` отдаёт только `owner_id`; имя/контакт автора
     * для админ-детали берём этим admin-only роутом (доступен MODERATOR/ADMIN).
     */
    getAdminListingOwner: build.query<AdminListingOwner, string>({
      query: (id) => ({ url: `/admin/listings/${id}/owner` }),
      providesTags: ['Admin'],
    }),

    listingModerationLogs: build.query<ListingModerationLogEntry[], string>({
      query: (id) => ({ url: `/admin/listings/${id}/moderation-logs` }),
      providesTags: ['Admin'],
    }),

    moderateListing: build.mutation<
      ModerationResult,
      { id: string; body: ModerateListingRequest }
    >({
      query: ({ id, body }) => ({
        url: `/admin/listings/${id}/status`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),

    /** `GET /listings/:id/translations` → все языковые версии листинга (§7). */
    getListingTranslations: build.query<ListingTranslations, string>({
      query: (id) => ({ url: `/listings/${id}/translations` }),
      providesTags: ['Admin'],
    }),

    /**
     * `POST /admin/listings/:id/translations/generate` — запуск машинного
     * перевода целевых языков (§7/ADR-0091). `force=true` перезаписывает даже
     * правленные вручную языки (оригинал не трогается). Ответ содержит
     * `regenerated`/`skipped` для честного тоста в UI.
     */
    generateTranslations: build.mutation<
      GenerateTranslationsResult,
      { id: string; force?: boolean }
    >({
      query: ({ id, force }) => ({
        url: `/admin/listings/${id}/translations/generate`,
        method: 'POST',
        body: { force },
      }),
      invalidatesTags: ['Admin'],
    }),

    /**
     * `PATCH /admin/listings/:id/translations/:language` — ручная правка одного
     * языка (§7/ADR-0091). Возвращает обновлённый набор переводов.
     */
    updateTranslation: build.mutation<
      ListingTranslations,
      { id: string; language: string; body: TranslationEditRequest }
    >({
      query: ({ id, language, body }) => ({
        url: `/admin/listings/${id}/translations/${language}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),

    /**
     * `PATCH /admin/listings/:id/original` — правка авторского оригинала: текст +
     * язык (ADR-0156). Смена языка переносит текст в правильный слот и очищает
     * производные переводы; далее модератор жмёт «Сгенерировать переводы».
     * Возвращает обновлённый набор переводов.
     */
    updateOriginalTranslation: build.mutation<
      ListingTranslations,
      { id: string; body: UpdateOriginalRequest }
    >({
      query: ({ id, body }) => ({
        url: `/admin/listings/${id}/original`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAdminListingsQuery,
  useGetAdminListingQuery,
  useGetAdminListingOwnerQuery,
  useListingModerationLogsQuery,
  useModerateListingMutation,
  useGetListingTranslationsQuery,
  useGenerateTranslationsMutation,
  useUpdateTranslationMutation,
  useUpdateOriginalTranslationMutation,
} = adminListingsApi;
