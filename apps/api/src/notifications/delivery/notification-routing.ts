import { NotificationChannel, NotificationType } from '@prisma/client';

/**
 * Политика маршрутизации уведомлений (ADR-0102, §3.2).
 *
 * Единственный источник правды «тип → каналы доставки».
 * IN_APP — обрабатывается продюсерами (в ленте), сюда не пишем.
 * EMAIL/PUSH — доставляет NotificationDispatcher.
 *
 * Добавить новый тип = одна строка здесь + одна запись в каталоге шаблонов.
 */
export const notificationRouting: Record<
  NotificationType,
  NotificationChannel[]
> = {
  // Новое сообщение в чате → email (с тротлингом 30 мин) + push.
  [NotificationType.NEW_CHAT_MESSAGE]: [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
    NotificationChannel.PUSH,
  ],

  // Новый отклик/запрос тура → email + push.
  [NotificationType.NEW_LEAD]: [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
    NotificationChannel.PUSH,
  ],

  // Смена статуса заявки на тур → email + push.
  [NotificationType.TOUR_REQUEST_STATUS_CHANGED]: [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
    NotificationChannel.PUSH,
  ],

  // Смена статуса модерации → email + push.
  [NotificationType.LISTING_MODERATION_STATUS_CHANGED]: [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
    NotificationChannel.PUSH,
  ],

  // Новое объявление по сохранённому поиску → только push.
  // Email уже шлёт существующий дайджест saved-search — не дублируем.
  [NotificationType.SAVED_SEARCH_NEW_LISTING]: [
    NotificationChannel.IN_APP,
    NotificationChannel.PUSH,
  ],

  // Истечение продвижения → email (без push: не срочно, letter достаточно).
  [NotificationType.PROMOTION_EXPIRED]: [
    NotificationChannel.IN_APP,
    NotificationChannel.EMAIL,
  ],

  // Админ-рассылка: доставки создаёт BroadcastDispatcher напрямую (по выбранным
  // каналам), а не штатный fan-out — поэтому здесь пусто (иначе будут дубли/нежеланные
  // каналы). SMS-нудж/email/push подключает BroadcastDispatcher + deliver-стадия (Task 4).
  [NotificationType.ADMIN_BROADCAST]: [],

  // Продюсеров нет — инертные типы; routing задан для полноты записи.
  [NotificationType.FAVORITE_PRICE_DROP]: [],
  [NotificationType.PROMOTION_ACTIVATED]: [],
};

/**
 * Вернуть каналы доставки для типа уведомления,
 * исключив IN_APP (он обрабатывается продюсерами, не диспетчером).
 */
export function channelsFor(type: NotificationType): NotificationChannel[] {
  return (notificationRouting[type] ?? []).filter(
    (ch) => ch !== NotificationChannel.IN_APP,
  );
}

/**
 * Типы, для которых email-доставка тротлируется по времени
 * (во избежание спама в чате — не слать повторное письмо ≤30 мин).
 */
export const EMAIL_THROTTLED_TYPES = new Set<NotificationType>([
  NotificationType.NEW_CHAT_MESSAGE,
]);
