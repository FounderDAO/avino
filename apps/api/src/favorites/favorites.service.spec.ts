import { HttpException } from '@nestjs/common';
import { ListingStatus, Prisma } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { FavoritesService } from './favorites.service';

/**
 * Юнит-тесты FavoritesService (TASK-090). Prisma и SearchService мокаются —
 * проверяются: добавление (201/404/409 ALREADY_FAVORITED по P2002), удаление
 * (204/404), keyset-список (порядок, total, next_cursor, исключение DELETED через
 * relation-фильтр) и разбор повреждённого курсора (400).
 */
describe('FavoritesService', () => {
  const USER_ID = 'u-user';
  const L1 = '11111111-1111-4111-8111-111111111111';
  const L2 = '22222222-2222-4222-8222-222222222222';

  const user: AuthenticatedUser = { id: USER_ID, roles: [UserRole.USER] };

  let prisma: any;
  let search: any;
  let service: FavoritesService;

  beforeEach(() => {
    prisma = {
      listing: { findUnique: jest.fn() },
      favorite: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    search = { cardsByIds: jest.fn().mockResolvedValue([]) };
    service = new FavoritesService(prisma, search);
  });

  async function expectError(p: Promise<unknown>, code: ApiErrorCode) {
    await expect(p).rejects.toBeInstanceOf(HttpException);
    await p.catch((e: HttpException) => {
      expect((e.getResponse() as { code: string }).code).toBe(code);
    });
  }

  describe('add', () => {
    it('создаёт избранное и возвращает квиток', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        status: ListingStatus.ACTIVE,
      });
      const createdAt = new Date('2026-06-05T10:00:00.000Z');
      prisma.favorite.create.mockResolvedValue({
        id: 'fav1',
        listingId: L1,
        createdAt,
      });

      await expect(service.add(user, L1)).resolves.toEqual({
        id: 'fav1',
        listing_id: L1,
        created_at: '2026-06-05T10:00:00.000Z',
      });
      expect(prisma.favorite.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, listingId: L1 },
        select: { id: true, listingId: true, createdAt: true },
      });
    });

    it('404, если листинга нет', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectError(service.add(user, L1), ApiErrorCode.NOT_FOUND);
      expect(prisma.favorite.create).not.toHaveBeenCalled();
    });

    it('404, если листинг DELETED', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        status: ListingStatus.DELETED,
      });
      await expectError(service.add(user, L1), ApiErrorCode.NOT_FOUND);
    });

    it('409 ALREADY_FAVORITED при дубликате (P2002)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        status: ListingStatus.ACTIVE,
      });
      prisma.favorite.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.0.0',
        }),
      );
      await expectError(service.add(user, L1), ApiErrorCode.ALREADY_FAVORITED);
    });
  });

  describe('remove', () => {
    it('удаляет по (user, listing)', async () => {
      prisma.favorite.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.remove(user, L1)).resolves.toBeUndefined();
      expect(prisma.favorite.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID, listingId: L1 },
      });
    });

    it('404, если в избранном нет', async () => {
      prisma.favorite.deleteMany.mockResolvedValue({ count: 0 });
      await expectError(service.remove(user, L1), ApiErrorCode.NOT_FOUND);
    });
  });

  describe('list', () => {
    it('отдаёт карточки через search.cardsByIds, total и next_cursor при hasMore', async () => {
      const c1 = new Date('2026-06-05T10:00:00.000Z');
      const c2 = new Date('2026-06-05T09:00:00.000Z');
      // limit=1, возвращаем 2 строки → hasMore.
      prisma.favorite.findMany.mockResolvedValue([
        { id: 'fav1', listingId: L1, createdAt: c1 },
        { id: 'fav2', listingId: L2, createdAt: c2 },
      ]);
      prisma.favorite.count.mockResolvedValue(5);
      search.cardsByIds.mockResolvedValue([{ id: L1 }]);

      const res = await service.list(user, 1, undefined, 'ru', undefined);

      expect(search.cardsByIds).toHaveBeenCalledWith([L1], 'ru', undefined);
      expect(res.data).toEqual([{ id: L1 }]);
      expect(res.meta.total).toBe(5);
      expect(res.meta.limit).toBe(1);
      expect(res.meta.next_cursor).not.toBeNull();
      // Курсор — позиция последнего показанного (fav1).
      const decoded = JSON.parse(
        Buffer.from(res.meta.next_cursor as string, 'base64url').toString(
          'utf8',
        ),
      );
      expect(decoded).toEqual({ createdAt: c1.toISOString(), id: 'fav1' });
    });

    it('next_cursor=null, когда страниц больше нет', async () => {
      prisma.favorite.findMany.mockResolvedValue([
        { id: 'fav1', listingId: L1, createdAt: new Date() },
      ]);
      prisma.favorite.count.mockResolvedValue(1);
      const res = await service.list(user, 20, undefined);
      expect(res.meta.next_cursor).toBeNull();
    });

    it('исключает DELETED-листинги relation-фильтром в where', async () => {
      prisma.favorite.findMany.mockResolvedValue([]);
      prisma.favorite.count.mockResolvedValue(0);
      await service.list(user, 20, undefined);
      const where = prisma.favorite.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        userId: USER_ID,
        listing: { status: { not: ListingStatus.DELETED } },
      });
    });

    it('400 на повреждённый курсор', async () => {
      await expectError(
        service.list(user, 20, 'not-a-valid-cursor!!!'),
        ApiErrorCode.VALIDATION_ERROR,
      );
    });
  });
});
