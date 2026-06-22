/**
 * notificationsApi — серверные уведомления (docs/API.md §14).
 *
 * Все эндпоинты — Bearer-only (гость получит 401). Потребитель
 * (`Notifications.tsx`) обязан передавать `{ skip: !isAuthenticated }`
 * в `useGetNotificationsQuery`, чтобы гости не дёргали защищённую ручку.
 */
import { baseApi } from './baseApi';

/** Тип уведомления (docs/API.md §14). */
export type NotificationType =
  | 'SAVED_SEARCH_NEW_LISTING'
  | 'FAVORITE_PRICE_DROP'
  | 'NEW_CHAT_MESSAGE'
  | 'LISTING_MODERATION_STATUS_CHANGED'
  | 'NEW_LEAD'
  | 'PROMOTION_ACTIVATED'
  | 'PROMOTION_EXPIRED'
  | 'TOUR_REQUEST_STATUS_CHANGED';

/** Статус доставки уведомления. */
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ';

/** Элемент GET /notifications (docs/API.md §14). */
export interface ApiNotification {
  id: string;
  type: NotificationType;
  channel: string;
  status: NotificationStatus;
  /**
   * Текст уведомления. Сейчас бэкенд хранит `null` (продюсеры пишут только
   * `type` + `data_json`; рендер делал бы EMAIL/PUSH-воркер, который ещё стаб).
   * In-app лента собирает текст из `type` + `data_json` через `notificationText`.
   */
  title: string | null;
  body: string | null;
  data_json: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

/** Envelope GET /notifications. */
interface NotificationsEnvelope {
  data: ApiNotification[];
  meta: { limit: number; total: number; unread?: number };
}

/** Нормализованный результат запроса для UI. */
export interface NotificationsResult {
  items: ApiNotification[];
  unread: number;
  total: number;
}

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Лента уведомлений текущего пользователя. GET /notifications?limit=30. */
    getNotifications: build.query<NotificationsResult, void>({
      query: () => '/notifications?limit=30',
      transformResponse: (env: NotificationsEnvelope): NotificationsResult => ({
        items: env.data,
        unread: env.meta.unread ?? 0,
        total: env.meta.total,
      }),
      providesTags: ['Notification'],
    }),

    /** Пометить уведомление прочитанным. POST /notifications/:id/read → 204. */
    markNotificationRead: build.mutation<void, string>({
      query: (id) => ({
        url: `/notifications/${encodeURIComponent(id)}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Notification'],
    }),

    /** Пометить все прочитанными. POST /notifications/read-all → 204. */
    markAllNotificationsRead: build.mutation<void, void>({
      query: () => ({
        url: '/notifications/read-all',
        method: 'POST',
      }),
      invalidatesTags: ['Notification'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
