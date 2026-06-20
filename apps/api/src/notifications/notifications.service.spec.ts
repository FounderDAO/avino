import { HttpException } from '@nestjs/common';
import {
  DevicePlatform,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { NotificationsService } from './notifications.service';

/**
 * Юнит-тесты NotificationsService.
 *
 * - Producer (TASK-123): промо-истечение ставится как PENDING-строка
 *   `notifications` (type=PROMOTION_EXPIRED, channel=EMAIL) внутри переданной
 *   транзакции, с ссылками сущностей в data_json.
 * - Reader (TASK-100, API.md §14): keyset-лента (порядок, total, unread,
 *   next_cursor, фильтры status/type, повреждённый курсор → 400), отметка
 *   прочтения одного (204 / 404 чужого) и всех (read_at IS NULL).
 */
describe('NotificationsService', () => {
  const OWNER_ID = '33333333-3333-3333-3333-333333333333';
  const N1 = '11111111-1111-4111-8111-111111111111';
  const N2 = '22222222-2222-4222-8222-222222222222';

  const user: AuthenticatedUser = { id: OWNER_ID, roles: [UserRole.USER] };

  let prisma: any;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      notificationDevice: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new NotificationsService(prisma);
  });

  async function expectError(p: Promise<unknown>, code: ApiErrorCode) {
    await expect(p).rejects.toBeInstanceOf(HttpException);
    await p.catch((e: HttpException) => {
      expect((e.getResponse() as { code: string }).code).toBe(code);
    });
  }

  describe('queuePromotionExpired', () => {
    it('queues a PROMOTION_EXPIRED notification as a PENDING EMAIL row', async () => {
      const tx = { notification: { create: jest.fn() } } as any;

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

  describe('queueChatMessage', () => {
    it('queues a NEW_CHAT_MESSAGE notification as a PENDING IN_APP row', async () => {
      const tx = { notification: { create: jest.fn() } } as any;

      await service.queueChatMessage(tx, OWNER_ID, {
        threadId: 'thread-1',
        listingId: 'listing-1',
        messageId: 'msg-1',
        senderId: 'sender-1',
      });

      expect(tx.notification.create).toHaveBeenCalledWith({
        data: {
          userId: OWNER_ID,
          type: NotificationType.NEW_CHAT_MESSAGE,
          channel: NotificationChannel.IN_APP,
          dataJson: {
            thread_id: 'thread-1',
            listing_id: 'listing-1',
            message_id: 'msg-1',
            sender_id: 'sender-1',
          },
        },
      });
    });
  });

  describe('queueTourRequest', () => {
    it('queueTourRequest ставит NEW_LEAD владельцу', async () => {
      const tx = { notification: { create: jest.fn() } } as any;
      await service.queueTourRequest(tx, 'OWNER1', {
        tourRequestId: 'TR1', listingId: 'L1', requestedDate: '2026-06-25',
        windowStart: '07:00', windowEnd: '10:00',
      });
      expect(tx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'OWNER1', type: 'NEW_LEAD', channel: 'IN_APP',
          dataJson: expect.objectContaining({ tour_request_id: 'TR1', listing_id: 'L1' }),
        }),
      });
    });
  });

  describe('queueTourStatusChanged', () => {
    it('queueTourStatusChanged ставит TOUR_REQUEST_STATUS_CHANGED', async () => {
      const tx = { notification: { create: jest.fn() } } as any;
      await service.queueTourStatusChanged(tx, 'U2', { tourRequestId: 'TR1', listingId: 'L1', status: 'CONFIRMED' });
      expect(tx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'U2', type: 'TOUR_REQUEST_STATUS_CHANGED', channel: 'IN_APP',
          dataJson: expect.objectContaining({ status: 'CONFIRMED' }),
        }),
      });
    });
  });

  describe('list', () => {
    function row(id: string, createdAt: Date) {
      return {
        id,
        type: NotificationType.NEW_CHAT_MESSAGE,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        title: 'Новое сообщение',
        body: 'У вас новое сообщение',
        dataJson: { thread_id: 't1' },
        readAt: null,
        createdAt,
      };
    }

    it('отдаёт ленту, total, unread и next_cursor при hasMore', async () => {
      const c1 = new Date('2026-06-05T10:00:00.000Z');
      const c2 = new Date('2026-06-05T09:00:00.000Z');
      // limit=1, возвращаем 2 строки → hasMore.
      prisma.notification.findMany.mockResolvedValue([row(N1, c1), row(N2, c2)]);
      prisma.notification.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(3); // unread

      const res = await service.list(user, { limit: 1 });

      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({
        id: N1,
        type: NotificationType.NEW_CHAT_MESSAGE,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        data_json: { thread_id: 't1' },
        read_at: null,
        created_at: c1.toISOString(),
      });
      expect(res.meta.total).toBe(5);
      expect(res.meta.unread).toBe(3);
      expect(res.meta.limit).toBe(1);
      const decoded = JSON.parse(
        Buffer.from(res.meta.next_cursor as string, 'base64url').toString(
          'utf8',
        ),
      );
      expect(decoded).toEqual({ createdAt: c1.toISOString(), id: N1 });
    });

    it('next_cursor=null, когда страниц больше нет', async () => {
      prisma.notification.findMany.mockResolvedValue([
        row(N1, new Date('2026-06-05T10:00:00.000Z')),
      ]);
      prisma.notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      const res = await service.list(user, { limit: 20 });
      expect(res.meta.next_cursor).toBeNull();
    });

    it('применяет фильтры status/type и scoping по user_id в where', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);
      await service.list(user, {
        status: NotificationStatus.READ,
        type: NotificationType.PROMOTION_EXPIRED,
      });
      const where = prisma.notification.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        userId: OWNER_ID,
        status: NotificationStatus.READ,
        type: NotificationType.PROMOTION_EXPIRED,
      });
    });

    it('unread считается по readAt:null независимо от фильтров', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);
      await service.list(user, { status: NotificationStatus.READ });
      // 3-й аргумент Promise.all — count непрочитанных (без фильтра status).
      const unreadWhere = prisma.notification.count.mock.calls[1][0].where;
      expect(unreadWhere).toEqual({ userId: OWNER_ID, readAt: null });
    });

    it('400 на повреждённый курсор', async () => {
      await expectError(
        service.list(user, { cursor: 'not-a-valid-cursor!!!' }),
        ApiErrorCode.VALIDATION_ERROR,
      );
    });
  });

  describe('markRead', () => {
    it('отмечает своё прочитанным (status READ + read_at)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      await expect(service.markRead(user, N1)).resolves.toBeUndefined();
      const call = prisma.notification.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: N1, userId: OWNER_ID });
      expect(call.data.status).toBe(NotificationStatus.READ);
      expect(call.data.readAt).toBeInstanceOf(Date);
    });

    it('404, если чужое/несуществующее', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      await expectError(service.markRead(user, N1), ApiErrorCode.NOT_FOUND);
    });
  });

  describe('markAllRead', () => {
    it('отмечает все непрочитанные пользователя (readAt:null)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 4 });
      await expect(service.markAllRead(user)).resolves.toBeUndefined();
      const call = prisma.notification.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ userId: OWNER_ID, readAt: null });
      expect(call.data.status).toBe(NotificationStatus.READ);
      expect(call.data.readAt).toBeInstanceOf(Date);
    });
  });

  describe('registerDevice', () => {
    const DEV_ID = '44444444-4444-4444-8444-444444444444';
    const TOKEN = 'fcm:abc123';

    it('регистрирует устройство как активное и возвращает квиток', async () => {
      prisma.notificationDevice.upsert.mockResolvedValue({
        id: DEV_ID,
        platform: DevicePlatform.ANDROID,
        isActive: true,
      });

      const res = await service.registerDevice(
        user,
        DevicePlatform.ANDROID,
        TOKEN,
      );

      expect(res).toEqual({
        id: DEV_ID,
        platform: DevicePlatform.ANDROID,
        is_active: true,
      });
    });

    it('upsert по push_token: create и claim-update переназначают текущему юзеру + реактивируют', async () => {
      prisma.notificationDevice.upsert.mockResolvedValue({
        id: DEV_ID,
        platform: DevicePlatform.IOS,
        isActive: true,
      });

      await service.registerDevice(user, DevicePlatform.IOS, TOKEN);

      const call = prisma.notificationDevice.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ pushToken: TOKEN });
      // create — новая строка с владельцем и активна.
      expect(call.create).toMatchObject({
        userId: OWNER_ID,
        platform: DevicePlatform.IOS,
        pushToken: TOKEN,
        isActive: true,
      });
      expect(call.create.lastSeenAt).toBeInstanceOf(Date);
      // update (claim) — токен переезжает на текущего юзера и реактивируется,
      // НЕ возвращает 409 (полный upsert/claim).
      expect(call.update).toMatchObject({
        userId: OWNER_ID,
        platform: DevicePlatform.IOS,
        isActive: true,
      });
      expect(call.update.lastSeenAt).toBeInstanceOf(Date);
      expect(call.update.pushToken).toBeUndefined();
    });
  });

  describe('removeDevice', () => {
    const DEV_ID = '44444444-4444-4444-8444-444444444444';

    it('удаляет своё устройство (hard delete, scoped по user_id)', async () => {
      prisma.notificationDevice.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.removeDevice(user, DEV_ID)).resolves.toBeUndefined();
      const call = prisma.notificationDevice.deleteMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: DEV_ID, userId: OWNER_ID });
    });

    it('404, если устройство чужое/несуществующее', async () => {
      prisma.notificationDevice.deleteMany.mockResolvedValue({ count: 0 });
      await expectError(
        service.removeDevice(user, DEV_ID),
        ApiErrorCode.NOT_FOUND,
      );
    });
  });
});
