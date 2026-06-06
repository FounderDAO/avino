import { NotFoundException } from '@nestjs/common';
import { ComplaintStatus, ListingStatus } from '@prisma/client';
import { ComplaintsService } from './complaints.service';

/**
 * Юнит-тесты ComplaintsService (TASK-132, API.md §16). Prisma мокается —
 * проверяются: проверка существования листинга (DELETED → 404) при создании,
 * сборка where-фильтров и дефолты/кап пагинации админ-списка, сортировка
 * `created_at DESC, id DESC`, snake_case-маппинг (`reporter_id` → `user_id`),
 * 404 на смену статуса несуществующей жалобы и проставление `handled_by`/
 * `handled_at`.
 */
describe('ComplaintsService', () => {
  let prisma: any;
  let service: ComplaintsService;

  beforeEach(() => {
    prisma = {
      listing: { findUnique: jest.fn() },
      complaint: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new ComplaintsService(prisma);
  });

  describe('create', () => {
    it('creates a complaint for an existing listing and returns { id, status }', async () => {
      prisma.listing.findUnique.mockResolvedValue({ status: ListingStatus.ACTIVE });
      prisma.complaint.create.mockResolvedValue({
        id: 'cmp1',
        status: ComplaintStatus.NEW,
      });

      const result = await service.create('user-1', {
        listing_id: 'l1',
        reason: 'fake',
        details: 'Фото не соответствуют',
      });

      expect(prisma.complaint.create).toHaveBeenCalledWith({
        data: {
          listingId: 'l1',
          reporterId: 'user-1',
          reason: 'fake',
          details: 'Фото не соответствуют',
        },
        select: { id: true, status: true },
      });
      expect(result).toEqual({ id: 'cmp1', status: ComplaintStatus.NEW });
    });

    it('defaults missing details to null', async () => {
      prisma.listing.findUnique.mockResolvedValue({ status: ListingStatus.ACTIVE });
      prisma.complaint.create.mockResolvedValue({
        id: 'cmp1',
        status: ComplaintStatus.NEW,
      });

      await service.create('user-1', { listing_id: 'l1', reason: 'spam' });

      expect(prisma.complaint.create.mock.calls[0][0].data.details).toBeNull();
    });

    it('throws 404 when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { listing_id: 'missing', reason: 'fake' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.complaint.create).not.toHaveBeenCalled();
    });

    it('throws 404 when the listing is DELETED', async () => {
      prisma.listing.findUnique.mockResolvedValue({ status: ListingStatus.DELETED });

      await expect(
        service.create('user-1', { listing_id: 'l1', reason: 'fake' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.complaint.create).not.toHaveBeenCalled();
    });
  });

  describe('listAdmin', () => {
    const row = {
      id: 'cmp1',
      listingId: 'l1',
      reporterId: 'user-1',
      reason: 'fake',
      details: 'детали',
      status: ComplaintStatus.NEW,
      handledBy: null,
      handledAt: null,
      createdAt: new Date('2026-06-06T00:00:00Z'),
    };

    it('applies filters, pagination and snake_case mapping', async () => {
      prisma.complaint.findMany.mockResolvedValue([row]);
      prisma.complaint.count.mockResolvedValue(1);

      const result = await service.listAdmin({
        status: ComplaintStatus.NEW,
        listing_id: 'l1',
        page: 3,
        limit: 5,
      });

      const args = prisma.complaint.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ status: ComplaintStatus.NEW, listingId: 'l1' });
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(args.skip).toBe(10);
      expect(args.take).toBe(5);
      expect(result.meta).toEqual({ page: 3, limit: 5, total: 1 });
      expect(result.data[0]).toEqual({
        id: 'cmp1',
        listing_id: 'l1',
        user_id: 'user-1',
        reason: 'fake',
        details: 'детали',
        status: ComplaintStatus.NEW,
        handled_by: null,
        handled_at: null,
        created_at: '2026-06-06T00:00:00.000Z',
      });
    });

    it('uses default pagination and an empty where when no filters given', async () => {
      prisma.complaint.findMany.mockResolvedValue([]);
      prisma.complaint.count.mockResolvedValue(0);

      const result = await service.listAdmin({});

      const args = prisma.complaint.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
      expect(args.skip).toBe(0);
      expect(args.take).toBe(20);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 0 });
    });

    it('caps limit at 100', async () => {
      prisma.complaint.findMany.mockResolvedValue([]);
      prisma.complaint.count.mockResolvedValue(0);

      await service.listAdmin({ limit: 500 });

      expect(prisma.complaint.findMany.mock.calls[0][0].take).toBe(100);
    });
  });

  describe('updateStatus', () => {
    it('throws 404 when the complaint does not exist', async () => {
      prisma.complaint.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('mod-1', 'missing', {
          status: ComplaintStatus.RESOLVED,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.complaint.update).not.toHaveBeenCalled();
    });

    it('sets status, handled_by and handled_at, returning the mapped complaint', async () => {
      prisma.complaint.findUnique.mockResolvedValue({ id: 'cmp1' });
      prisma.complaint.update.mockResolvedValue({
        id: 'cmp1',
        listingId: 'l1',
        reporterId: 'user-1',
        reason: 'fake',
        details: null,
        status: ComplaintStatus.RESOLVED,
        handledBy: 'mod-1',
        handledAt: new Date('2026-06-06T10:00:00Z'),
        createdAt: new Date('2026-06-06T00:00:00Z'),
      });

      const result = await service.updateStatus('mod-1', 'cmp1', {
        status: ComplaintStatus.RESOLVED,
      });

      const args = prisma.complaint.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 'cmp1' });
      expect(args.data.status).toBe(ComplaintStatus.RESOLVED);
      expect(args.data.handledBy).toBe('mod-1');
      expect(args.data.handledAt).toBeInstanceOf(Date);
      expect(result).toEqual({
        id: 'cmp1',
        listing_id: 'l1',
        user_id: 'user-1',
        reason: 'fake',
        details: null,
        status: ComplaintStatus.RESOLVED,
        handled_by: 'mod-1',
        handled_at: '2026-06-06T10:00:00.000Z',
        created_at: '2026-06-06T00:00:00.000Z',
      });
    });
  });
});
