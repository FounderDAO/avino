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
  let service: ChatService;

  beforeEach(() => {
    prisma = {
      listing: { findUnique: jest.fn() },
      chatThread: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      chatMessage: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    search = { cardsByIds: jest.fn().mockResolvedValue([]) };
    service = new ChatService(prisma, search);
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
});
