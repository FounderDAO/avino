import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BroadcastAudience,
  BroadcastStatus,
  Language,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastAudienceService } from './broadcast-audience.service';

function makeAudience() {
  return {
    previewCounts: jest.fn().mockResolvedValue({
      total: 10,
      perChannel: { inApp: 10, email: 8, push: 2, sms: 9 },
    }),
  } as unknown as BroadcastAudienceService;
}

function baseDto() {
  return {
    audienceType: BroadcastAudience.SEGMENT,
    language: Language.RU,
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    title: 'T',
    body: 'B',
    mode: 'now' as const,
  };
}

interface FullRow {
  id: string;
  status: BroadcastStatus;
  audienceType: string;
  language: string;
  channels: NotificationChannel[];
  title: string;
  body: string;
  recipientCount: number;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  filterStatus: string | null;
  filterRole: string | null;
  targetUserId: string | null;
  createdById: string;
}

/** Полный Prisma-row рассылки для строгой toView(). */
function makeRow(overrides: Partial<FullRow> = {}): FullRow {
  return {
    id: 'b1',
    status: BroadcastStatus.SCHEDULED,
    audienceType: BroadcastAudience.SEGMENT as string,
    language: Language.RU as string,
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    title: 'T',
    body: 'B',
    recipientCount: 0,
    scheduledAt: new Date('2030-01-01T00:00:00.000Z'),
    sentAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    filterStatus: null,
    filterRole: null,
    targetUserId: null,
    createdById: 'admin1',
    ...overrides,
  };
}

describe('BroadcastsService.create', () => {
  it('creates a SCHEDULED broadcast with scheduledAt=now for mode "now" + audit', async () => {
    const prisma = {
      broadcast: { create: jest.fn().mockResolvedValue(makeRow({ status: BroadcastStatus.SCHEDULED })) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const config = { get: jest.fn().mockReturnValue(5000) };
    const svc = new BroadcastsService(prisma as never, makeAudience(), config as never);
    const res = await svc.create('admin1', baseDto());
    expect(prisma.broadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 'admin1',
          status: BroadcastStatus.SCHEDULED,
          scheduledAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: 'admin1', action: 'BROADCAST_CREATE' }),
      }),
    );
    expect(res).toEqual(expect.objectContaining({ id: 'b1' }));
  });

  it('rejects scheduled mode with a past scheduledAt', async () => {
    const prisma = { broadcast: { create: jest.fn() }, auditLog: { create: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue(5000) };
    const svc = new BroadcastsService(prisma as never, makeAudience(), config as never);
    await expect(
      svc.create('admin1', {
        ...baseDto(),
        mode: 'scheduled',
        scheduledAt: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BroadcastsService.cancel', () => {
  it('cancels a SCHEDULED broadcast', async () => {
    const canceledRow = makeRow({ status: BroadcastStatus.CANCELED });
    const prisma = {
      broadcast: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(canceledRow),
      },
      auditLog: { create: jest.fn() },
    };
    const config = { get: jest.fn().mockReturnValue(5000) };
    const svc = new BroadcastsService(prisma as never, makeAudience(), config as never);
    const res = await svc.cancel('admin1', 'b1');
    expect(prisma.broadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1', status: BroadcastStatus.SCHEDULED },
        data: { status: BroadcastStatus.CANCELED },
      }),
    );
    expect(res.status).toBe('CANCELED');
  });
});

describe('BroadcastsService.getDetail', () => {
  it('returns detail with delivery_stats', async () => {
    const row = makeRow();
    const prisma = {
      broadcast: {
        findUnique: jest.fn().mockResolvedValue(row),
      },
      notificationDelivery: {
        groupBy: jest.fn().mockResolvedValue([
          { channel: 'EMAIL', status: 'SENT', _count: { _all: 5 } },
          { channel: 'EMAIL', status: 'FAILED', _count: { _all: 1 } },
        ]),
      },
      notification: {
        count: jest
          .fn()
          .mockResolvedValueOnce(10) // inAppTotal
          .mockResolvedValueOnce(3),  // inAppRead
      },
    };
    const config = { get: jest.fn().mockReturnValue(5000) };
    const svc = new BroadcastsService(prisma as never, makeAudience(), config as never);
    const res = await svc.getDetail('b1');

    expect(res.delivery_stats['EMAIL']).toEqual({ SENT: 5, FAILED: 1 });
    expect(res.delivery_stats[NotificationChannel.IN_APP]).toEqual({ total: 10, read: 3 });
  });

  it('throws NotFoundException when broadcast not found', async () => {
    const prisma = {
      broadcast: { findUnique: jest.fn().mockResolvedValue(null) },
      notificationDelivery: { groupBy: jest.fn() },
      notification: { count: jest.fn() },
    };
    const config = { get: jest.fn().mockReturnValue(5000) };
    const svc = new BroadcastsService(prisma as never, makeAudience(), config as never);
    await expect(svc.getDetail('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BroadcastsService.list', () => {
  it('returns paginated data with meta', async () => {
    const row = makeRow();
    const prisma = {
      broadcast: {
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const config = { get: jest.fn().mockReturnValue(5000) };
    const svc = new BroadcastsService(prisma as never, makeAudience(), config as never);
    const res = await svc.list({});

    expect(res.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].recipient_count).toBe(0);
    expect(res.data[0].id).toBe('b1');
  });
});

describe('BroadcastsService.create — recipient cap (M-4)', () => {
  it('throws 422 when audience exceeds BROADCAST_MAX_RECIPIENTS', async () => {
    const bigAudience = {
      previewCounts: jest.fn().mockResolvedValue({
        total: 10001,
        perChannel: { inApp: 10001, email: 9000, push: 5000, sms: 10001 },
      }),
    } as unknown as BroadcastAudienceService;
    const prisma = { broadcast: { create: jest.fn() }, auditLog: { create: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue(5000) };
    const svc = new BroadcastsService(prisma as never, bigAudience, config as never);
    await expect(svc.create('admin1', baseDto())).rejects.toMatchObject({
      status: 422,
    });
    expect(prisma.broadcast.create).not.toHaveBeenCalled();
  });
});
