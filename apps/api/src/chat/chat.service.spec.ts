import { HttpException } from '@nestjs/common';
import { ListingStatus, Prisma } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { ChatService } from './chat.service';

/**
 * Юнит-тесты ChatService (TASK-110). Prisma и SearchService мокаются —
 * проверяются: создание/получение треда (201 новый / 200 идемпотентный, 404 нет
 * листинга, 422 LISTING_NOT_AVAILABLE для DELETED/непубличного, 403 «себе»,
 * P2002-гонка → существующий), keyset-список (поля, unread через groupBy,
 * preview через search.cardsByIds, total/next_cursor, where OR initiator/owner,
 * обе ветки курсора) и разбор повреждённого курсора (400).
 */
describe('ChatService', () => {
  const USER_ID = 'u-initiator';
  const OWNER_ID = 'u-owner';
  const L1 = '11111111-1111-4111-8111-111111111111';
  const L2 = '22222222-2222-4222-8222-222222222222';
  const KEY = (listingId: string) => ({
    listingId_initiatorId_ownerId: {
      listingId,
      initiatorId: USER_ID,
      ownerId: OWNER_ID,
    },
  });

  const user: AuthenticatedUser = { id: USER_ID, roles: [UserRole.USER] };

  let prisma: any;
  let search: any;
  let notifications: any;
  let realtime: any;
  let service: ChatService;

  beforeEach(() => {
    prisma = {
      listing: { findUnique: jest.fn() },
      chatThread: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      chatMessage: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      userBlock: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // $transaction исполняет callback с самим prisma как tx (мок).
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    search = { cardsByIds: jest.fn().mockResolvedValue([]) };
    notifications = { queueChatMessage: jest.fn() };
    const uploads = { getObjectUrl: jest.fn().mockResolvedValue('https://signed/a.webp') };
    realtime = { emit: jest.fn() };
    service = new ChatService(
      prisma,
      search,
      notifications,
      uploads as any,
      realtime,
    );
  });

  async function expectError(p: Promise<unknown>, code: ApiErrorCode) {
    await expect(p).rejects.toBeInstanceOf(HttpException);
    await p.catch((e: HttpException) => {
      expect((e.getResponse() as { code: string }).code).toBe(code);
    });
  }

  describe('createThread', () => {
    it('создаёт новый тред (created=true) на ACTIVE-листинге', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ownerId: OWNER_ID,
        status: ListingStatus.ACTIVE,
      });
      prisma.chatThread.findUnique.mockResolvedValue(null);
      const createdAt = new Date('2026-06-05T10:00:00.000Z');
      prisma.chatThread.create.mockResolvedValue({
        id: 't1',
        listingId: L1,
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
        createdAt,
      });

      const res = await service.createThread(user, L1);

      expect(res.created).toBe(true);
      expect(res.thread).toEqual({
        id: 't1',
        listing_id: L1,
        initiator_id: USER_ID,
        owner_id: OWNER_ID,
        created_at: '2026-06-05T10:00:00.000Z',
      });
      expect(prisma.chatThread.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { listingId: L1, initiatorId: USER_ID, ownerId: OWNER_ID },
        }),
      );
    });

    it('возвращает существующий тред идемпотентно (created=false)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ownerId: OWNER_ID,
        status: ListingStatus.ACTIVE,
      });
      prisma.chatThread.findUnique.mockResolvedValue({
        id: 't1',
        listingId: L1,
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      });

      const res = await service.createThread(user, L1);

      expect(res.created).toBe(false);
      expect(res.thread.id).toBe('t1');
      expect(prisma.chatThread.create).not.toHaveBeenCalled();
      expect(prisma.chatThread.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: KEY(L1) }),
      );
    });

    it('404, если листинга нет', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectError(service.createThread(user, L1), ApiErrorCode.NOT_FOUND);
      expect(prisma.chatThread.create).not.toHaveBeenCalled();
    });

    it('422 LISTING_NOT_AVAILABLE, если листинг DELETED', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ownerId: OWNER_ID,
        status: ListingStatus.DELETED,
      });
      await expectError(
        service.createThread(user, L1),
        ApiErrorCode.LISTING_NOT_AVAILABLE,
      );
    });

    it('422 LISTING_NOT_AVAILABLE, если листинг непубличный (DRAFT)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ownerId: OWNER_ID,
        status: ListingStatus.DRAFT,
      });
      await expectError(
        service.createThread(user, L1),
        ApiErrorCode.LISTING_NOT_AVAILABLE,
      );
    });

    it('403, если пишешь самому себе (owner == initiator)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ownerId: USER_ID,
        status: ListingStatus.ACTIVE,
      });
      await expectError(service.createThread(user, L1), ApiErrorCode.FORBIDDEN);
      expect(prisma.chatThread.create).not.toHaveBeenCalled();
    });

    it('P2002-гонка на создании → возвращает существующий тред (created=false)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ownerId: OWNER_ID,
        status: ListingStatus.ACTIVE,
      });
      // Первый findUnique (предпроверка) — null; после P2002 повторный — найден.
      prisma.chatThread.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 't-raced',
          listingId: L1,
          initiatorId: USER_ID,
          ownerId: OWNER_ID,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
        });
      prisma.chatThread.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.0.0',
        }),
      );

      const res = await service.createThread(user, L1);
      expect(res.created).toBe(false);
      expect(res.thread.id).toBe('t-raced');
    });

    it('403, если владелец листинга заблокировал инициатора (или наоборот)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ownerId: OWNER_ID,
        status: ListingStatus.ACTIVE,
      });
      prisma.chatThread.findUnique.mockResolvedValue(null);
      prisma.userBlock.findFirst.mockResolvedValue({ id: 'block-1' });

      await expectError(service.createThread(user, L1), ApiErrorCode.FORBIDDEN);
      expect(prisma.userBlock.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: USER_ID, blockedId: OWNER_ID },
            { blockerId: OWNER_ID, blockedId: USER_ID },
          ],
        },
        select: { id: true },
      });
      expect(prisma.chatThread.create).not.toHaveBeenCalled();
    });
  });

  describe('listThreads', () => {
    it('маппит поля, total и next_cursor при hasMore; preview через search', async () => {
      const lma = new Date('2026-06-05T10:00:00.000Z');
      const c1 = new Date('2026-06-04T10:00:00.000Z');
      const c2 = new Date('2026-06-03T10:00:00.000Z');
      // limit=1, возвращаем 2 строки → hasMore.
      prisma.chatThread.findMany.mockResolvedValue([
        {
          id: 't1',
          listingId: L1,
          initiatorId: USER_ID,
          ownerId: OWNER_ID,
          lastMessageAt: lma,
          createdAt: c1,
        },
        {
          id: 't2',
          listingId: L2,
          initiatorId: USER_ID,
          ownerId: OWNER_ID,
          lastMessageAt: null,
          createdAt: c2,
        },
      ]);
      prisma.chatThread.count.mockResolvedValue(5);
      search.cardsByIds.mockResolvedValue([
        {
          id: L1,
          title: '3-комн',
          thumbnail_url: 'https://cdn/x.webp',
          price: '950000000.00',
          currency: 'UZS',
          status: ListingStatus.ACTIVE,
        },
      ]);
      prisma.chatMessage.groupBy.mockResolvedValue([
        { threadId: 't1', _count: { _all: 2 } },
      ]);

      const res = await service.listThreads(user, 1, undefined, 'ru', undefined);

      expect(search.cardsByIds).toHaveBeenCalledWith([L1], 'ru', undefined);
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toEqual({
        id: 't1',
        listing_id: L1,
        initiator_id: USER_ID,
        owner_id: OWNER_ID,
        last_message_at: '2026-06-05T10:00:00.000Z',
        unread_count: 2,
        listing_preview: {
          title: '3-комн',
          thumbnail_url: 'https://cdn/x.webp',
          price: '950000000.00',
          currency: 'UZS',
          status: ListingStatus.ACTIVE,
        },
        // Профиль/сообщения не замоканы → фолбэк собеседника и пустая реплика.
        counterparty: { id: OWNER_ID, name: null, avatar_url: null },
        last_message: null,
      });
      expect(res.meta.total).toBe(5);
      expect(res.meta.limit).toBe(1);
      const decoded = JSON.parse(
        Buffer.from(res.meta.next_cursor as string, 'base64url').toString(
          'utf8',
        ),
      );
      expect(decoded).toEqual({
        lastMessageAt: lma.toISOString(),
        createdAt: c1.toISOString(),
        id: 't1',
      });
    });

    it('гидрирует собеседника (displayName) и превью последней реплики', async () => {
      const lma = new Date('2026-06-05T10:05:00.000Z');
      prisma.chatThread.findMany.mockResolvedValue([
        {
          id: 't1',
          listingId: L1,
          initiatorId: USER_ID,
          ownerId: OWNER_ID,
          lastMessageAt: lma,
          createdAt: new Date('2026-06-04T10:00:00.000Z'),
        },
      ]);
      prisma.chatThread.count.mockResolvedValue(1);
      // Собеседник текущего USER_ID (initiator) — owner OWNER_ID.
      prisma.user.findMany.mockResolvedValue([
        {
          id: OWNER_ID,
          profile: {
            displayName: 'Тимур Сафаров',
            firstName: null,
            lastName: null,
            avatarUrl: 'https://cdn/a.webp',
          },
        },
      ]);
      prisma.chatMessage.findMany.mockResolvedValue([
        {
          id: 'm-last',
          threadId: 't1',
          senderId: OWNER_ID,
          body: 'Да, конечно.',
          isRead: false,
          createdAt: lma,
        },
      ]);

      const res = await service.listThreads(user, 20, undefined);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [OWNER_ID] } } }),
      );
      // distinct по threadId с порядком threadId,createdAt DESC,id DESC.
      const msgCall = prisma.chatMessage.findMany.mock.calls[0][0];
      expect(msgCall.distinct).toEqual(['threadId']);
      expect(msgCall.orderBy).toEqual([
        { threadId: 'asc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
      expect(res.data[0].counterparty).toEqual({
        id: OWNER_ID,
        name: 'Тимур Сафаров',
        avatar_url: 'https://cdn/a.webp',
      });
      expect(res.data[0].last_message).toEqual({
        id: 'm-last',
        sender_id: OWNER_ID,
        body: 'Да, конечно.',
        is_read: false,
        created_at: '2026-06-05T10:05:00.000Z',
      });
    });

    it('имя собеседника из firstName/lastName, если displayName пуст', async () => {
      prisma.chatThread.findMany.mockResolvedValue([
        {
          id: 't1',
          listingId: L1,
          initiatorId: USER_ID,
          ownerId: OWNER_ID,
          lastMessageAt: null,
          createdAt: new Date('2026-06-04T10:00:00.000Z'),
        },
      ]);
      prisma.chatThread.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([
        {
          id: OWNER_ID,
          profile: {
            displayName: '  ',
            firstName: 'Тимур',
            lastName: 'Сафаров',
            avatarUrl: null,
          },
        },
      ]);

      const res = await service.listThreads(user, 20, undefined);

      expect(res.data[0].counterparty).toEqual({
        id: OWNER_ID,
        name: 'Тимур Сафаров',
        avatar_url: null,
      });
    });

    it('next_cursor=null и unread=0/preview=null, когда страниц больше нет', async () => {
      prisma.chatThread.findMany.mockResolvedValue([
        {
          id: 't1',
          listingId: L1,
          initiatorId: OWNER_ID,
          ownerId: USER_ID,
          lastMessageAt: null,
          createdAt: new Date(),
        },
      ]);
      prisma.chatThread.count.mockResolvedValue(1);
      const res = await service.listThreads(user, 20, undefined);
      expect(res.meta.next_cursor).toBeNull();
      expect(res.data[0].unread_count).toBe(0);
      expect(res.data[0].listing_preview).toBeNull();
      expect(res.data[0].last_message_at).toBeNull();
    });

    it('фильтрует треды пользователя по OR(initiator, owner)', async () => {
      prisma.chatThread.findMany.mockResolvedValue([]);
      prisma.chatThread.count.mockResolvedValue(0);
      await service.listThreads(user, 20, undefined);
      const where = prisma.chatThread.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        OR: [{ initiatorId: USER_ID }, { ownerId: USER_ID }],
      });
    });

    it('курсор в NULL-хвосте → фильтр только по NULL last_message_at', async () => {
      prisma.chatThread.findMany.mockResolvedValue([]);
      prisma.chatThread.count.mockResolvedValue(0);
      const cursor = Buffer.from(
        JSON.stringify({
          lastMessageAt: null,
          createdAt: '2026-06-03T10:00:00.000Z',
          id: 't2',
        }),
        'utf8',
      ).toString('base64url');

      await service.listThreads(user, 20, cursor);
      const where = prisma.chatThread.findMany.mock.calls[0][0].where;
      const pageCond = where.AND[1];
      expect(pageCond.lastMessageAt).toBeNull();
      expect(pageCond.OR).toEqual([
        { createdAt: { lt: new Date('2026-06-03T10:00:00.000Z') } },
        { createdAt: new Date('2026-06-03T10:00:00.000Z'), id: { lt: 't2' } },
      ]);
    });

    it('курсор с last_message_at → ветка с переходом в NULL-секцию', async () => {
      prisma.chatThread.findMany.mockResolvedValue([]);
      prisma.chatThread.count.mockResolvedValue(0);
      const cursor = Buffer.from(
        JSON.stringify({
          lastMessageAt: '2026-06-05T10:00:00.000Z',
          createdAt: '2026-06-04T10:00:00.000Z',
          id: 't1',
        }),
        'utf8',
      ).toString('base64url');

      await service.listThreads(user, 20, cursor);
      const where = prisma.chatThread.findMany.mock.calls[0][0].where;
      const pageCond = where.AND[1];
      expect(pageCond.OR).toContainEqual({ lastMessageAt: null });
      expect(pageCond.OR[0]).toEqual({
        lastMessageAt: { lt: new Date('2026-06-05T10:00:00.000Z') },
      });
    });

    it('400 на повреждённый курсор', async () => {
      await expectError(
        service.listThreads(user, 20, 'not-a-valid-cursor!!!'),
        ApiErrorCode.VALIDATION_ERROR,
      );
    });
  });

  const T1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const M1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const owner: AuthenticatedUser = { id: OWNER_ID, roles: [UserRole.USER] };
  const moderator: AuthenticatedUser = {
    id: 'u-mod',
    roles: [UserRole.MODERATOR],
  };
  const stranger: AuthenticatedUser = { id: 'u-x', roles: [UserRole.USER] };

  /** Тред initiator=USER_ID, owner=OWNER_ID на листинге L1. */
  function threadRow(status: ListingStatus = ListingStatus.ACTIVE) {
    return {
      initiatorId: USER_ID,
      ownerId: OWNER_ID,
      listingId: L1,
      listing: { status },
    };
  }

  describe('блокировки (Apple 1.2)', () => {
    it('listThreads исключает треды с заблокированными собеседниками', async () => {
      prisma.userBlock.findMany.mockResolvedValue([{ blockedId: OWNER_ID }]);
      prisma.chatThread.findMany.mockResolvedValue([]);
      prisma.chatThread.count.mockResolvedValue(0);
      await service.listThreads(user, undefined, undefined);
      expect(prisma.chatThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            NOT: {
              OR: [
                { initiatorId: { in: [OWNER_ID] } },
                { ownerId: { in: [OWNER_ID] } },
              ],
            },
          }),
        }),
      );
    });

    it('listThreads считает total по тому же where со скрытием блокировок', async () => {
      prisma.userBlock.findMany.mockResolvedValue([{ blockedId: OWNER_ID }]);
      prisma.chatThread.findMany.mockResolvedValue([]);
      prisma.chatThread.count.mockResolvedValue(0);
      await service.listThreads(user, undefined, undefined);
      expect(prisma.chatThread.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          NOT: {
            OR: [
              { initiatorId: { in: [OWNER_ID] } },
              { ownerId: { in: [OWNER_ID] } },
            ],
          },
        }),
      });
    });

    it('listThreads не добавляет NOT в where, если блок-лист пуст', async () => {
      prisma.chatThread.findMany.mockResolvedValue([]);
      prisma.chatThread.count.mockResolvedValue(0);
      await service.listThreads(user, undefined, undefined);
      const where = prisma.chatThread.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        OR: [{ initiatorId: USER_ID }, { ownerId: USER_ID }],
      });
      expect(where.NOT).toBeUndefined();
    });

    it('createMessage → 403 FORBIDDEN, если получатель заблокировал отправителя', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(threadRow()); // валидный тред, user — участник
      prisma.userBlock.findFirst.mockResolvedValue({ id: 'block-1' });
      await expectError(
        service.createMessage(user, T1, 'привет'),
        ApiErrorCode.FORBIDDEN,
      );
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('createMessage → 403, если отправитель заблокировал получателя', async () => {
      // findFirst ищет блок в ОБЕ стороны одним OR — этот кейс покрывает where
      prisma.chatThread.findUnique.mockResolvedValue(threadRow());
      prisma.userBlock.findFirst.mockResolvedValue({ id: 'block-2' });
      await expectError(
        service.createMessage(user, T1, 'привет'),
        ApiErrorCode.FORBIDDEN,
      );
      expect(prisma.userBlock.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: USER_ID, blockedId: OWNER_ID },
            { blockerId: OWNER_ID, blockedId: USER_ID },
          ],
        },
        select: { id: true },
      });
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    it('маппит сообщения (DESC), next_cursor при hasMore', async () => {
      prisma.chatThread.findUnique.mockResolvedValue({
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
      });
      const c1 = new Date('2026-06-05T10:00:00.000Z');
      const c2 = new Date('2026-06-05T09:00:00.000Z');
      // limit=1, возвращаем 2 → hasMore.
      prisma.chatMessage.findMany.mockResolvedValue([
        {
          id: M1,
          threadId: T1,
          senderId: USER_ID,
          body: 'Здравствуйте',
          isRead: false,
          createdAt: c1,
        },
        {
          id: 'm2',
          threadId: T1,
          senderId: OWNER_ID,
          body: 'Да',
          isRead: true,
          createdAt: c2,
        },
      ]);

      const res = await service.listMessages(user, T1, 1, undefined);

      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toEqual({
        id: M1,
        thread_id: T1,
        sender_id: USER_ID,
        body: 'Здравствуйте',
        is_read: false,
        created_at: '2026-06-05T10:00:00.000Z',
      });
      expect(res.meta.limit).toBe(1);
      const decoded = JSON.parse(
        Buffer.from(res.meta.next_cursor as string, 'base64url').toString(
          'utf8',
        ),
      );
      expect(decoded).toEqual({ createdAt: c1.toISOString(), id: M1 });
      const order = prisma.chatMessage.findMany.mock.calls[0][0].orderBy;
      expect(order).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('next_cursor=null, когда страниц больше нет', async () => {
      prisma.chatThread.findUnique.mockResolvedValue({
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
      });
      prisma.chatMessage.findMany.mockResolvedValue([]);
      const res = await service.listMessages(user, T1, 20, undefined);
      expect(res.meta.next_cursor).toBeNull();
      expect(res.data).toEqual([]);
    });

    it('404, если треда нет', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(null);
      await expectError(
        service.listMessages(user, T1, 20, undefined),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('403, если не участник и не модератор', async () => {
      prisma.chatThread.findUnique.mockResolvedValue({
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
      });
      await expectError(
        service.listMessages(stranger, T1, 20, undefined),
        ApiErrorCode.FORBIDDEN,
      );
    });

    it('MODERATOR может читать сообщения (complaint-flow)', async () => {
      prisma.chatThread.findUnique.mockResolvedValue({
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
      });
      prisma.chatMessage.findMany.mockResolvedValue([]);
      const res = await service.listMessages(moderator, T1, 20, undefined);
      expect(res.data).toEqual([]);
    });

    it('400 на повреждённый курсор', async () => {
      prisma.chatThread.findUnique.mockResolvedValue({
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
      });
      await expectError(
        service.listMessages(user, T1, 20, 'bad!!!'),
        ApiErrorCode.VALIDATION_ERROR,
      );
    });
  });

  describe('createMessage', () => {
    it('создаёт сообщение, двигает last_message_at и шлёт уведомление владельцу', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(threadRow());
      const createdAt = new Date('2026-06-05T12:00:00.000Z');
      prisma.chatMessage.create.mockResolvedValue({
        id: M1,
        threadId: T1,
        senderId: USER_ID,
        body: 'Актуально?',
        isRead: false,
        createdAt,
      });

      const res = await service.createMessage(user, T1, 'Актуально?');

      expect(res).toEqual({
        id: M1,
        thread_id: T1,
        sender_id: USER_ID,
        body: 'Актуально?',
        is_read: false,
        created_at: '2026-06-05T12:00:00.000Z',
      });
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { threadId: T1, senderId: USER_ID, body: 'Актуально?' },
        }),
      );
      expect(prisma.chatThread.update).toHaveBeenCalledWith({
        where: { id: T1 },
        data: { lastMessageAt: createdAt },
      });
      // Отправитель = initiator → уведомление получает owner.
      expect(notifications.queueChatMessage).toHaveBeenCalledWith(
        prisma,
        OWNER_ID,
        { threadId: T1, listingId: L1, messageId: M1, senderId: USER_ID },
      );
    });

    it('уведомление получает initiator, когда отправитель — owner', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(threadRow());
      prisma.chatMessage.create.mockResolvedValue({
        id: M1,
        threadId: T1,
        senderId: OWNER_ID,
        body: 'Да',
        isRead: false,
        createdAt: new Date('2026-06-05T12:00:00.000Z'),
      });

      await service.createMessage(owner, T1, 'Да');

      expect(notifications.queueChatMessage).toHaveBeenCalledWith(
        prisma,
        USER_ID,
        expect.objectContaining({ senderId: OWNER_ID }),
      );
    });

    it('404, если треда нет', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(null);
      await expectError(
        service.createMessage(user, T1, 'x'),
        ApiErrorCode.NOT_FOUND,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('403, если не участник (модератор писать не может)', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(threadRow());
      await expectError(
        service.createMessage(moderator, T1, 'x'),
        ApiErrorCode.FORBIDDEN,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('422 LISTING_NOT_AVAILABLE, если листинг DELETED', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(
        threadRow(ListingStatus.DELETED),
      );
      await expectError(
        service.createMessage(user, T1, 'x'),
        ApiErrorCode.LISTING_NOT_AVAILABLE,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('разрешает писать на не-ACTIVE, но не-DELETED листинге (SOLD)', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(
        threadRow(ListingStatus.SOLD),
      );
      prisma.chatMessage.create.mockResolvedValue({
        id: M1,
        threadId: T1,
        senderId: USER_ID,
        body: 'ещё доступно?',
        isRead: false,
        createdAt: new Date('2026-06-05T12:00:00.000Z'),
      });
      const res = await service.createMessage(user, T1, 'ещё доступно?');
      expect(res.id).toBe(M1);
    });

    it('эмитит инвалидации получателю после коммита', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(threadRow());
      prisma.chatMessage.create.mockResolvedValue({
        id: M1,
        threadId: T1,
        senderId: USER_ID,
        body: 'Актуально?',
        isRead: false,
        createdAt: new Date('2026-06-05T12:00:00.000Z'),
      });

      await service.createMessage(user, T1, 'Актуально?');

      // Отправитель = initiator (USER_ID) → эмиты идут owner'у, не отправителю.
      expect(realtime.emit).toHaveBeenCalledWith(OWNER_ID, {
        type: 'thread',
        id: T1,
      });
      expect(realtime.emit).toHaveBeenCalledWith(OWNER_ID, {
        type: 'thread_list',
      });
      expect(realtime.emit).toHaveBeenCalledWith(OWNER_ID, {
        type: 'notification',
      });
      expect(realtime.emit).not.toHaveBeenCalledWith(
        USER_ID,
        expect.anything(),
      );
    });
  });

  describe('markRead', () => {
    it('отмечает входящие (sender != user) прочитанными', async () => {
      prisma.chatThread.findUnique.mockResolvedValue({
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
      });
      prisma.chatMessage.updateMany.mockResolvedValue({ count: 3 });

      await service.markRead(user, T1);

      expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
        where: { threadId: T1, senderId: { not: USER_ID }, isRead: false },
        data: { isRead: true },
      });
    });

    it('404, если треда нет', async () => {
      prisma.chatThread.findUnique.mockResolvedValue(null);
      await expectError(service.markRead(user, T1), ApiErrorCode.NOT_FOUND);
      expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
    });

    it('403, если не участник (модератор отметить не может)', async () => {
      prisma.chatThread.findUnique.mockResolvedValue({
        initiatorId: USER_ID,
        ownerId: OWNER_ID,
      });
      await expectError(
        service.markRead(moderator, T1),
        ApiErrorCode.FORBIDDEN,
      );
      expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
    });
  });
});
