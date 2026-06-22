/**
 * notificationText — клиентский рендер заголовка/тела in-app уведомления из
 * `type` + `data_json` (вариант C).
 *
 * Почему на клиенте: бэкенд-продюсеры (moderation/chat/saved-search/promotion)
 * пишут только структуру (`type` + `data_json`), а колонки `title`/`body`
 * остаются NULL — их должен был рендерить EMAIL/PUSH-воркер при отправке, но
 * транспорт ещё стаб. Лента TASK-100 отдавала бы пустые карточки. Здесь текст
 * собирается локально через next-intl, поэтому он живёт на языке интерфейса
 * (RU/UZ/EN) и переключается в рантайме без миграций и без изменений бэкенда.
 *
 * Если сервер когда-нибудь начнёт заполнять `title`/`body` (после подключения
 * воркера) — потребитель отдаёт приоритет серверному тексту, а этот хелпер
 * остаётся фолбэком (см. `Notifications.tsx`).
 */
import type { NotificationType } from '@/store/api/notificationsApi';

/** Переводчик, заскоупленный на неймспейс `account` (см. `useTranslations`). */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Готовый текст карточки уведомления. */
export interface NotificationContent {
  title: string;
  body: string;
}

/** Корневой префикс ключей i18n (внутри неймспейса `account`). */
const K = 'notifications.types';
const MOD = `${K}.LISTING_MODERATION_STATUS_CHANGED`;
const TOUR = `${K}.TOUR_REQUEST_STATUS_CHANGED`;

/** Безопасно достаёт непустую строку из `data_json` (иначе undefined). */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Тело уведомления о смене статуса модерации — по `new_status` из data_json. */
function moderationBody(
  data: Record<string, unknown>,
  t: Translate,
): string {
  const status = str(data.new_status);
  if (status === 'REJECTED') {
    const reason = str(data.reason);
    return reason
      ? t(`${MOD}.body_REJECTED_reason`, { reason })
      : t(`${MOD}.body_REJECTED`);
  }
  // ACTIVE / DRAFT / DELETED — собственные ключи; иначе общий фолбэк.
  if (status === 'ACTIVE' || status === 'DRAFT' || status === 'DELETED') {
    return t(`${MOD}.body_${status}`);
  }
  return t(`${MOD}.body`);
}

/** Тело уведомления о смене статуса тура — по `status` из data_json. */
function tourStatusBody(
  data: Record<string, unknown>,
  t: Translate,
): string {
  const status = str(data.status);
  // CONFIRMED / DECLINED / CANCELLED — собственные ключи; иначе общий фолбэк.
  if (status === 'CONFIRMED' || status === 'DECLINED' || status === 'CANCELLED') {
    return t(`${TOUR}.body_${status}`);
  }
  return t(`${TOUR}.body`);
}

/**
 * Собирает {заголовок, тело} уведомления для in-app ленты из его `type` и
 * `data_json`. Неизвестный тип → generic-фолбэк (бэкенд может добавлять новые
 * типы — ADR-0008, non-breaking).
 */
export function notificationContent(
  type: NotificationType,
  data: Record<string, unknown> | null,
  t: Translate,
): NotificationContent {
  const d = data ?? {};

  switch (type) {
    case 'SAVED_SEARCH_NEW_LISTING': {
      const name = str(d.saved_search_name);
      return {
        title: t(`${K}.SAVED_SEARCH_NEW_LISTING.title`),
        body: name
          ? t(`${K}.SAVED_SEARCH_NEW_LISTING.body`, { name })
          : t(`${K}.SAVED_SEARCH_NEW_LISTING.body_noname`),
      };
    }
    case 'FAVORITE_PRICE_DROP':
      return {
        title: t(`${K}.FAVORITE_PRICE_DROP.title`),
        body: t(`${K}.FAVORITE_PRICE_DROP.body`),
      };
    case 'NEW_CHAT_MESSAGE':
      return {
        title: t(`${K}.NEW_CHAT_MESSAGE.title`),
        body: t(`${K}.NEW_CHAT_MESSAGE.body`),
      };
    case 'LISTING_MODERATION_STATUS_CHANGED':
      return {
        title: t(`${MOD}.title`),
        body: moderationBody(d, t),
      };
    case 'TOUR_REQUEST_STATUS_CHANGED':
      return {
        title: t(`${TOUR}.title`),
        body: tourStatusBody(d, t),
      };
    case 'NEW_LEAD':
      return {
        title: t(`${K}.NEW_LEAD.title`),
        body: t(`${K}.NEW_LEAD.body`),
      };
    case 'PROMOTION_ACTIVATED':
      return {
        title: t(`${K}.PROMOTION_ACTIVATED.title`),
        body: t(`${K}.PROMOTION_ACTIVATED.body`),
      };
    case 'PROMOTION_EXPIRED':
      return {
        title: t(`${K}.PROMOTION_EXPIRED.title`),
        body: t(`${K}.PROMOTION_EXPIRED.body`),
      };
    default:
      return {
        title: t(`${K}.generic.title`),
        body: t(`${K}.generic.body`),
      };
  }
}
