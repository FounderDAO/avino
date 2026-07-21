import { adminApi } from './adminApi';
import { toQueryParams } from './pagination';
import type { Paginated } from './pagination';
import type {
  AuditLog,
  AuditLogFilters,
  ModerationLog,
  ModerationLogFilters,
  NotificationLog,
  NotificationLogFilters,
  OtpLog,
  OtpLogFilters,
  PromotionLog,
  PromotionLogFilters,
} from './adminTypes';

/**
 * adminLogsApi (ADMIN-14) — read-only журналы админ-панели (API.md §16, TASK-131).
 *
 * Инъекция в общий `adminApi` (CLAUDE.md §4: только RTK Query, без fetch/axios
 * в компонентах). Все четыре эндпоинта — чистое чтение (мутаций нет), помечены
 * тегом `Admin`; инвалидируются вместе с остальной админкой при любой мутации
 * (модерация/промо/жалобы), что для логов и нужно — журнал сразу подхватывает
 * только что записанное действие. Доступ на бэкенде ограничен ADMIN (RolesGuard).
 *
 * Все четыре — page-based `Paginated<T>` (1-based `page` + `limit`, §4). Фильтры
 * опциональны и комбинируются через AND; `toQueryParams` отбрасывает пустые
 * значения, чтобы не слать «пустые» фильтры (forward-compatible, §4).
 *
 * - `GET /admin/audit-logs?action&actor_id&entity_type&entity_id&page&limit`
 *   → `Paginated<AuditLog>` (security audit-лог, `audit_logs`, ADR-004).
 * - `GET /admin/moderation-logs?listing_id&moderator_id&action&page&limit`
 *   → `Paginated<ModerationLog>` (глобальный журнал модерации).
 * - `GET /admin/promotion-logs?listing_id&admin_id&action&page&limit`
 *   → `Paginated<PromotionLog>` (журнал админских действий над промо).
 * - `GET /admin/notification-logs?user_id&type&channel&status&page&limit`
 *   → `Paginated<NotificationLog>` (глобальный журнал уведомлений).
 * - `GET /admin/otp-logs?destination&page&limit` → `Paginated<OtpLog>`
 *   (журнал OTP-запросов, ADR-0150; кода/хеша в ответе нет).
 */
export const adminLogsApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    listAuditLogs: build.query<Paginated<AuditLog>, AuditLogFilters>({
      query: (filters) => ({
        url: '/admin/audit-logs',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    listModerationLogs: build.query<
      Paginated<ModerationLog>,
      ModerationLogFilters
    >({
      query: (filters) => ({
        url: '/admin/moderation-logs',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    listPromotionLogs: build.query<
      Paginated<PromotionLog>,
      PromotionLogFilters
    >({
      query: (filters) => ({
        url: '/admin/promotion-logs',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    listNotificationLogs: build.query<
      Paginated<NotificationLog>,
      NotificationLogFilters
    >({
      query: (filters) => ({
        url: '/admin/notification-logs',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),

    listOtpLogs: build.query<Paginated<OtpLog>, OtpLogFilters>({
      query: (filters) => ({
        url: '/admin/otp-logs',
        params: toQueryParams({ ...filters }),
      }),
      providesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAuditLogsQuery,
  useListModerationLogsQuery,
  useListPromotionLogsQuery,
  useListNotificationLogsQuery,
  useListOtpLogsQuery,
} = adminLogsApi;
