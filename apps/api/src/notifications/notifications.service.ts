import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationType,
  Prisma,
} from '@prisma/client';

/** Ссылки на сущности промо для рендера письма (data_json уведомления). */
export interface PromotionExpiredNotificationData {
  listingId: string;
  promotionId: string;
  promotionType: string;
  expiredAt: string;
}

/**
 * NotificationsService — единая точка постановки уведомлений (DB_SCHEMA §11).
 *
 * В Avino уведомление «ставится в очередь» как строка `notifications` со
 * `status = PENDING`; отдельный воркер подберёт её и отправит EMAIL/PUSH позже —
 * синхронной отправки внутри запроса/джобы нет (как в ModerationService). Метод
 * принимает Prisma-клиент (`tx`), чтобы создание уведомления коммитилось в одной
 * транзакции с доменной мутацией (атомарность: либо и истечение, и уведомление,
 * либо ничего).
 */
@Injectable()
export class NotificationsService {
  /**
   * Поставить уведомление владельцу об истечении промо (TASK-123,
   * `NotificationType.PROMOTION_EXPIRED`). Канал — EMAIL (как у статусов
   * модерации); транспорт подключается позже.
   */
  async queuePromotionExpired(
    tx: Prisma.TransactionClient,
    userId: string,
    data: PromotionExpiredNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.PROMOTION_EXPIRED,
        channel: NotificationChannel.EMAIL,
        dataJson: {
          listing_id: data.listingId,
          promotion_id: data.promotionId,
          promotion_type: data.promotionType,
          expired_at: data.expiredAt,
        },
      },
    });
  }
}
