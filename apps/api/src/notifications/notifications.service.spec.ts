import { NotificationChannel, NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

/**
 * Юнит-тесты NotificationsService (TASK-123). Проверяют, что промо-истечение
 * ставится как PENDING-строка `notifications` (type=PROMOTION_EXPIRED,
 * channel=EMAIL) внутри переданной транзакции, с ссылками сущностей в data_json.
 */
describe('NotificationsService', () => {
  const OWNER_ID = '33333333-3333-3333-3333-333333333333';

  it('queues a PROMOTION_EXPIRED notification as a PENDING EMAIL row', async () => {
    const tx = { notification: { create: jest.fn() } } as any;
    const service = new NotificationsService();

    await service.queuePromotionExpired(tx, OWNER_ID, {
      listingId: 'listing-1',
      promotionId: 'promo-1',
      promotionType: 'VIP',
      expiredAt: '2026-06-01T00:00:00.000Z',
    });

    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        userId: OWNER_ID,
        type: NotificationType.PROMOTION_EXPIRED,
        channel: NotificationChannel.EMAIL,
        dataJson: {
          listing_id: 'listing-1',
          promotion_id: 'promo-1',
          promotion_type: 'VIP',
          expired_at: '2026-06-01T00:00:00.000Z',
        },
      },
    });
  });
});
