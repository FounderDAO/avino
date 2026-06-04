import { HttpException } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto';
import { SavedSearchesService } from './saved-searches.service';

/**
 * Юнит-тесты SavedSearchesService (TASK-091). Prisma мокается — проверяются:
 * создание (201, 422 UNSUPPORTED_FILTER_SCHEMA при неизвестной schemaVersion),
 * обновление (200 / 404 чужого через `(id,user_id)`-гард / 422), удаление
 * (204 / 404) и список (порядок, total, маппинг snake_case + last_checked_at).
 */
describe('SavedSearchesService', () => {
  const USER_ID = 'u-user';
  const S1 = '11111111-1111-4111-8111-111111111111';

  const user: AuthenticatedUser = { id: USER_ID, roles: [UserRole.USER] };

  let prisma: any;
  let service: SavedSearchesService;

  beforeEach(() => {
    prisma = {
      savedSearch: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new SavedSearchesService(prisma);
  });

  async function expectError(p: Promise<unknown>, code: ApiErrorCode) {
    await expect(p).rejects.toBeInstanceOf(HttpException);
    await p.catch((e: HttpException) => {
      expect((e.getResponse() as { code: string }).code).toBe(code);
    });
  }

  const rowS1 = {
    id: S1,
    name: '2-комн Юнусабад',
    isActive: true,
    filtersJson: { schemaVersion: 1, filters: { city_id: 'c1', rooms: 2 } },
    lastCheckedAt: new Date('2026-06-02T06:00:00.000Z'),
    createdAt: new Date('2026-06-05T10:00:00.000Z'),
  };

  describe('create', () => {
    const dto: CreateSavedSearchDto = {
      name: '2-комн Юнусабад',
      filters_json: { schemaVersion: 1, filters: { city_id: 'c1', rooms: 2 } },
    };

    it('создаёт поиск и маппит ответ в snake_case', async () => {
      prisma.savedSearch.create.mockResolvedValue(rowS1);

      await expect(service.create(user, dto)).resolves.toEqual({
        id: S1,
        name: '2-комн Юнусабад',
        is_active: true,
        filters_json: { schemaVersion: 1, filters: { city_id: 'c1', rooms: 2 } },
        last_checked_at: '2026-06-02T06:00:00.000Z',
        created_at: '2026-06-05T10:00:00.000Z',
      });
      expect(prisma.savedSearch.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          name: '2-комн Юнусабад',
          filtersJson: { schemaVersion: 1, filters: { city_id: 'c1', rooms: 2 } },
        },
        select: expect.any(Object),
      });
    });

    it('422 UNSUPPORTED_FILTER_SCHEMA при неизвестной schemaVersion', async () => {
      await expectError(
        service.create(user, {
          name: 'x',
          filters_json: { schemaVersion: 99, filters: {} },
        }),
        ApiErrorCode.UNSUPPORTED_FILTER_SCHEMA,
      );
      expect(prisma.savedSearch.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('обновляет только переданные поля своей строки', async () => {
      prisma.savedSearch.updateMany.mockResolvedValue({ count: 1 });
      prisma.savedSearch.findUnique.mockResolvedValue({
        ...rowS1,
        name: 'new name',
        isActive: false,
      });

      const res = await service.update(user, S1, {
        name: 'new name',
        is_active: false,
      });

      expect(prisma.savedSearch.updateMany).toHaveBeenCalledWith({
        where: { id: S1, userId: USER_ID },
        data: { name: 'new name', isActive: false },
      });
      expect(res.name).toBe('new name');
      expect(res.is_active).toBe(false);
    });

    it('404, если поиск чужой или не найден (count=0)', async () => {
      prisma.savedSearch.updateMany.mockResolvedValue({ count: 0 });
      await expectError(
        service.update(user, S1, { name: 'x' }),
        ApiErrorCode.NOT_FOUND,
      );
      expect(prisma.savedSearch.findUnique).not.toHaveBeenCalled();
    });

    it('422 при неизвестной schemaVersion (до записи)', async () => {
      await expectError(
        service.update(user, S1, {
          filters_json: { schemaVersion: 2, filters: {} },
        }),
        ApiErrorCode.UNSUPPORTED_FILTER_SCHEMA,
      );
      expect(prisma.savedSearch.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('удаляет по (id, user)', async () => {
      prisma.savedSearch.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.remove(user, S1)).resolves.toBeUndefined();
      expect(prisma.savedSearch.deleteMany).toHaveBeenCalledWith({
        where: { id: S1, userId: USER_ID },
      });
    });

    it('404, если поиск чужой или не найден', async () => {
      prisma.savedSearch.deleteMany.mockResolvedValue({ count: 0 });
      await expectError(service.remove(user, S1), ApiErrorCode.NOT_FOUND);
    });
  });

  describe('list', () => {
    it('отдаёт страницу пользователя, total и limit; last_checked_at=null маппится', async () => {
      prisma.savedSearch.findMany.mockResolvedValue([
        { ...rowS1, lastCheckedAt: null },
      ]);
      prisma.savedSearch.count.mockResolvedValue(3);

      const res = await service.list(user, undefined);

      expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
        }),
      );
      expect(res.meta).toEqual({ limit: 20, total: 3 });
      expect(res.data[0].last_checked_at).toBeNull();
      expect(res.data[0].id).toBe(S1);
    });

    it('ограничивает limit максимумом 100', async () => {
      prisma.savedSearch.findMany.mockResolvedValue([]);
      prisma.savedSearch.count.mockResolvedValue(0);
      const res = await service.list(user, 500);
      expect(res.meta.limit).toBe(100);
      expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });
});
