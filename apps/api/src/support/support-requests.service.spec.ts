import { NotFoundException } from '@nestjs/common';
import { SupportRequestStatus } from '@prisma/client';
import { SupportRequestsService } from './support-requests.service';

/**
 * Юнит-тесты SupportRequestsService. Prisma мокается — проверяются: создание
 * гостем (user_id null) и юзером, where-фильтр статуса и дефолты/кап пагинации
 * админ-списка, сортировка created_at DESC, snake_case-маппинг, 404 на смену
 * статуса несуществующего обращения и проставление handled_by/handled_at.
 */
describe('SupportRequestsService', () => {
  let prisma: any;
  let service: SupportRequestsService;

  const ROW = {
    id: 'sr1',
    userId: null as string | null,
    name: 'Али',
    contact: '+998901234567',
    message: 'Не могу изменить объявление',
    status: SupportRequestStatus.NEW,
    handledBy: null as string | null,
    handledAt: null as Date | null,
    createdAt: new Date('2026-07-16T09:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      supportRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new SupportRequestsService(prisma);
  });

  describe('create', () => {
    it('создаёт обращение гостя (userId null) и возвращает { id, status }', async () => {
      prisma.supportRequest.create.mockResolvedValue({ id: 'sr1', status: SupportRequestStatus.NEW });

      const result = await service.create(null, {
        contact: '+998901234567',
        message: 'Помогите',
      });

      expect(prisma.supportRequest.create).toHaveBeenCalledWith({
        data: { userId: null, name: null, contact: '+998901234567', message: 'Помогите' },
        select: { id: true, status: true },
      });
      expect(result).toEqual({ id: 'sr1', status: SupportRequestStatus.NEW });
    });

    it('привязывает user_id авторизованного и передаёт name', async () => {
      prisma.supportRequest.create.mockResolvedValue({ id: 'sr2', status: SupportRequestStatus.NEW });

      await service.create('user-1', { name: 'Али', contact: 'ali@mail.uz', message: 'Вопрос' });

      expect(prisma.supportRequest.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', name: 'Али', contact: 'ali@mail.uz', message: 'Вопрос' },
        select: { id: true, status: true },
      });
    });
  });

  describe('listAdmin', () => {
    it('фильтрует по статусу, применяет пагинацию и маппит snake_case', async () => {
      prisma.supportRequest.findMany.mockResolvedValue([ROW]);
      prisma.supportRequest.count.mockResolvedValue(1);

      const result = await service.listAdmin({ status: SupportRequestStatus.NEW, page: 2, limit: 10 });

      expect(prisma.supportRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: SupportRequestStatus.NEW },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 10,
          take: 10,
        }),
      );
      expect(result.meta).toEqual({ page: 2, limit: 10, total: 1 });
      expect(result.data[0]).toEqual({
        id: 'sr1',
        user_id: null,
        name: 'Али',
        contact: '+998901234567',
        message: 'Не могу изменить объявление',
        status: SupportRequestStatus.NEW,
        handled_by: null,
        handled_at: null,
        created_at: '2026-07-16T09:00:00.000Z',
      });
    });

    it('дефолты page=1/limit=20, лимит капится на 100', async () => {
      prisma.supportRequest.findMany.mockResolvedValue([]);
      prisma.supportRequest.count.mockResolvedValue(0);

      await service.listAdmin({});
      expect(prisma.supportRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, where: {} }),
      );

      await service.listAdmin({ limit: 500 as never });
      expect(prisma.supportRequest.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('updateStatus', () => {
    it('404 на несуществующее обращение', async () => {
      prisma.supportRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('mod-1', 'nope', { status: SupportRequestStatus.RESOLVED }),
      ).rejects.toThrow(NotFoundException);
    });

    it('меняет статус и проставляет handled_by/handled_at', async () => {
      prisma.supportRequest.findUnique.mockResolvedValue({ id: 'sr1' });
      prisma.supportRequest.update.mockResolvedValue({
        ...ROW,
        status: SupportRequestStatus.RESOLVED,
        handledBy: 'mod-1',
        handledAt: new Date('2026-07-16T10:00:00Z'),
      });

      const result = await service.updateStatus('mod-1', 'sr1', {
        status: SupportRequestStatus.RESOLVED,
      });

      expect(prisma.supportRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sr1' },
          data: expect.objectContaining({ status: SupportRequestStatus.RESOLVED, handledBy: 'mod-1' }),
        }),
      );
      expect(result.status).toBe(SupportRequestStatus.RESOLVED);
      expect(result.handled_by).toBe('mod-1');
      expect(result.handled_at).toBe('2026-07-16T10:00:00.000Z');
    });
  });
});
