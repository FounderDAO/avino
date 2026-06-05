import {
  ListingStatus,
  ModerationAction,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  PromotionAdminAction,
  PromotionType,
} from '@prisma/client';
import { AdminLogsService } from './admin-logs.service';

/**
 * Юнит-тесты AdminLogsService (TASK-131, API.md §16). Prisma мокается —
 * проверяются сборка where-фильтров, дефолты/кап пагинации, сортировка
 * `created_at DESC, id DESC` и snake_case-маппинг для трёх журналов
 * (moderation/promotion/notification), включая nullable-поля и JSON.
 */
describe('AdminLogsService', () => {
  let prisma: any;
  let service: AdminLogsService;

  beforeEach(() => {
    prisma = {
      moderationLog: { findMany: jest.fn(), count: jest.fn() },
      promotionLog: { findMany: jest.fn(), count: jest.fn() },
      notification: { findMany: jest.fn(), count: jest.fn() },
    };
    service = new AdminLogsService(prisma);
  });

  describe('listModerationLogs', () => {
    const row = {
      id: 'm1',
      listingId: 'l1',
      moderatorId: 'mod-1',
      action: ModerationAction.REJECT,
      oldStatus: ListingStatus.NEW,
      newStatus: ListingStatus.REJECTED,
      reason: 'нет фото',
      createdAt: new Date('2026-06-02T00:00:00Z'),
    };

    it('applies filters, pagination and snake_case mapping', async () => {
      prisma.moderationLog.findMany.mockResolvedValue([row]);
      prisma.moderationLog.count.mockResolvedValue(1);

      const result = await service.listModerationLogs({
        listing_id: 'l1',
        moderator_id: 'mod-1',
        action: ModerationAction.REJECT,
        page: 3,
        limit: 5,
      });

      const args = prisma.moderationLog.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        listingId: 'l1',
        moderatorId: 'mod-1',
        action: ModerationAction.REJECT,
      });
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(args.skip).toBe(10);
      expect(args.take).toBe(5);
      expect(result.meta).toEqual({ page: 3, limit: 5, total: 1 });
      expect(result.data[0]).toEqual({
        id: 'm1',
        listing_id: 'l1',
        moderator_id: 'mod-1',
        action: ModerationAction.REJECT,
        old_status: ListingStatus.NEW,
        new_status: ListingStatus.REJECTED,
        reason: 'нет фото',
        created_at: '2026-06-02T00:00:00.000Z',
      });
    });

    it('defaults page/limit, caps limit at 100, empty where', async () => {
      prisma.moderationLog.findMany.mockResolvedValue([]);
      prisma.moderationLog.count.mockResolvedValue(0);

      await service.listModerationLogs({ limit: 500 });

      const args = prisma.moderationLog.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
      expect(args.take).toBe(100);
      expect(args.skip).toBe(0);
    });
  });

  describe('listPromotionLogs', () => {
    const row = {
      id: 'p1',
      listingPromotionId: 'lp1',
      listingId: 'l1',
      adminId: 'admin-1',
      action: PromotionAdminAction.EXTEND_PROMOTION,
      oldType: PromotionType.VIP,
      newType: PromotionType.VIP,
      oldExpiresAt: new Date('2026-06-10T00:00:00Z'),
      newExpiresAt: new Date('2026-06-17T00:00:00Z'),
      reason: null,
      createdAt: new Date('2026-06-03T00:00:00Z'),
    };

    it('applies filters and maps date deltas to ISO', async () => {
      prisma.promotionLog.findMany.mockResolvedValue([row]);
      prisma.promotionLog.count.mockResolvedValue(1);

      const result = await service.listPromotionLogs({
        listing_id: 'l1',
        admin_id: 'admin-1',
        action: PromotionAdminAction.EXTEND_PROMOTION,
      });

      const args = prisma.promotionLog.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        listingId: 'l1',
        adminId: 'admin-1',
        action: PromotionAdminAction.EXTEND_PROMOTION,
      });
      expect(result.data[0]).toEqual({
        id: 'p1',
        listing_promotion_id: 'lp1',
        listing_id: 'l1',
        admin_id: 'admin-1',
        action: PromotionAdminAction.EXTEND_PROMOTION,
        old_type: PromotionType.VIP,
        new_type: PromotionType.VIP,
        old_expires_at: '2026-06-10T00:00:00.000Z',
        new_expires_at: '2026-06-17T00:00:00.000Z',
        reason: null,
        created_at: '2026-06-03T00:00:00.000Z',
      });
    });

    it('maps null promotion/admin/dates to null', async () => {
      prisma.promotionLog.findMany.mockResolvedValue([
        {
          ...row,
          listingPromotionId: null,
          adminId: null,
          oldType: null,
          newType: PromotionType.TOP,
          oldExpiresAt: null,
          newExpiresAt: null,
        },
      ]);
      prisma.promotionLog.count.mockResolvedValue(1);

      const result = await service.listPromotionLogs({});

      expect(result.data[0]).toMatchObject({
        listing_promotion_id: null,
        admin_id: null,
        old_type: null,
        new_type: PromotionType.TOP,
        old_expires_at: null,
        new_expires_at: null,
      });
    });
  });

  describe('listNotificationLogs', () => {
    const row = {
      id: 'n1',
      userId: 'u1',
      type: NotificationType.NEW_CHAT_MESSAGE,
      channel: NotificationChannel.EMAIL,
      status: NotificationStatus.SENT,
      title: 'Новое сообщение',
      body: 'У вас новое сообщение',
      dataJson: { thread_id: 't1' },
      readAt: null,
      sentAt: new Date('2026-06-04T00:00:00Z'),
      createdAt: new Date('2026-06-04T00:00:00Z'),
    };

    it('applies all filters and maps snake_case including data_json', async () => {
      prisma.notification.findMany.mockResolvedValue([row]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.listNotificationLogs({
        user_id: 'u1',
        type: NotificationType.NEW_CHAT_MESSAGE,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
      });

      const args = prisma.notification.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        userId: 'u1',
        type: NotificationType.NEW_CHAT_MESSAGE,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
      });
      expect(result.data[0]).toEqual({
        id: 'n1',
        user_id: 'u1',
        type: NotificationType.NEW_CHAT_MESSAGE,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
        title: 'Новое сообщение',
        body: 'У вас новое сообщение',
        data_json: { thread_id: 't1' },
        read_at: null,
        sent_at: '2026-06-04T00:00:00.000Z',
        created_at: '2026-06-04T00:00:00.000Z',
      });
    });

    it('maps null data_json/sent_at to null', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { ...row, dataJson: null, sentAt: null, title: null, body: null },
      ]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.listNotificationLogs({});

      expect(result.data[0]).toMatchObject({
        data_json: null,
        sent_at: null,
        title: null,
        body: null,
      });
    });
  });
});
