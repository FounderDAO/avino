import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated, PageParams } from './pagination';

/**
 * adminBroadcastsApi (ADR-0103) — рассылки уведомлений (API.md §broadcasts).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Все query-эндпоинты помечены тегом `Admin`; мутации create/cancel
 * инвалидируют `Admin`, чтобы список и детали перечитывались после действия.
 *
 * Важно про snake_case / camelCase:
 * - Тела запросов (request body) отправляются в camelCase (как DTO на бэкенде).
 * - Ответы list/detail/create/cancel — snake_case (BroadcastListItem, BroadcastDetail).
 * - Ответ preview — camelCase (AudiencePreview), как отдаёт бэкенд.
 *
 * Эндпоинты:
 * - `GET /admin/broadcasts?status&page&limit` → `Paginated<BroadcastListItem>`.
 * - `GET /admin/broadcasts/:id` → `BroadcastDetail`.
 * - `POST /admin/broadcasts` → `BroadcastListItem` (создание/запуск рассылки).
 * - `POST /admin/broadcasts/preview` → `AudiencePreview` (без кэша).
 * - `POST /admin/broadcasts/:id/cancel` → `BroadcastListItem`.
 */

// ─── string-union типы ───────────────────────────────────────────────────────

export type BroadcastStatusValue =
  | 'SCHEDULED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELED';

export type BroadcastAudienceValue = 'SINGLE' | 'SEGMENT';

export type BroadcastChannelValue = 'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS';

export type BroadcastLanguageValue = 'UZ' | 'RU' | 'EN';

export type BroadcastUserStatusValue = 'ACTIVE' | 'BLOCKED' | 'DELETED';

// ─── view-объекты (snake_case, как отдаёт бэкенд) ───────────────────────────

export interface BroadcastListItem {
  id: string;
  status: BroadcastStatusValue;
  audience_type: BroadcastAudienceValue;
  language: BroadcastLanguageValue;
  channels: BroadcastChannelValue[];
  title: string;
  recipient_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface BroadcastDetail extends BroadcastListItem {
  body: string;
  filter_status: string | null;
  filter_role: string | null;
  target_user_id: string | null;
  delivery_stats: Record<string, Record<string, number>>;
}

/** camelCase — как отдаёт бэкенд для preview-эндпоинта. */
export interface AudiencePreview {
  total: number;
  perChannel: {
    inApp: number;
    email: number;
    push: number;
    sms: number;
  };
}

// ─── request DTO (camelCase, как принимает бэкенд) ──────────────────────────

export interface CreateBroadcastRequest {
  audienceType: BroadcastAudienceValue;
  targetUserId?: string;
  language: BroadcastLanguageValue;
  filterStatus?: BroadcastUserStatusValue;
  filterRole?: string;
  channels: BroadcastChannelValue[];
  title: string;
  body: string;
  mode: 'now' | 'scheduled';
  scheduledAt?: string;
}

export interface PreviewAudienceRequest {
  audienceType: BroadcastAudienceValue;
  targetUserId?: string;
  language: BroadcastLanguageValue;
  filterStatus?: BroadcastUserStatusValue;
  filterRole?: string;
}

export interface ListBroadcastsParams extends PageParams {
  status?: BroadcastStatusValue;
}

// ─── эндпоинты ───────────────────────────────────────────────────────────────

export const adminBroadcastsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listBroadcasts: build.query<Paginated<BroadcastListItem>, ListBroadcastsParams>({
      query: (params) => ({
        url: '/admin/broadcasts',
        params: toQueryParams({ ...params }),
      }),
      providesTags: ['Admin'],
    }),

    getBroadcast: build.query<BroadcastDetail, string>({
      query: (id) => ({ url: `/admin/broadcasts/${id}` }),
      providesTags: ['Admin'],
    }),

    createBroadcast: build.mutation<BroadcastListItem, CreateBroadcastRequest>({
      query: (body) => ({
        url: '/admin/broadcasts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),

    /** preview — без тегов кэша (вычислительный, не мутирует данные). */
    previewAudience: build.mutation<AudiencePreview, PreviewAudienceRequest>({
      query: (body) => ({
        url: '/admin/broadcasts/preview',
        method: 'POST',
        body,
      }),
    }),

    cancelBroadcast: build.mutation<BroadcastListItem, string>({
      query: (id) => ({
        url: `/admin/broadcasts/${id}/cancel`,
        method: 'POST',
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListBroadcastsQuery,
  useGetBroadcastQuery,
  useCreateBroadcastMutation,
  usePreviewAudienceMutation,
  useCancelBroadcastMutation,
} = adminBroadcastsApi;
