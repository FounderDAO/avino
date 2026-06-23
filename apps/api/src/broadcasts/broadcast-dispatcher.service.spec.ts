import { BroadcastAudience, Language, NotificationChannel } from '@prisma/client';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';
import { BroadcastAudienceService } from './broadcast-audience.service';

function makeAudience() {
  return new BroadcastAudienceService({ user: { count: jest.fn() } } as never);
}

describe('BroadcastDispatcherService.materialize', () => {
  it('creates a notification per recipient + deliveries for selected reachable channels', async () => {
    const broadcast = {
      id: 'b1',
      audienceType: BroadcastAudience.SEGMENT,
      targetUserId: null,
      language: Language.RU,
      filterStatus: null,
      filterRole: null,
      channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      title: 'T',
      body: 'B',
      status: 'SENDING',
    };
    const prisma = {
      broadcast: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }), // гард-переход SCHEDULED→SENDING
        findUnique: jest.fn().mockResolvedValue(broadcast),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'u1', email: 'a@b.uz', phone: '+998901112233' }, // email+sms
            { id: 'u2', email: null, phone: null },                // ни email, ни phone
          ])
          .mockResolvedValueOnce([]), // следующий батч пуст
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'n1', userId: 'u1' },
          { id: 'n2', userId: 'u2' },
        ]),
      },
      notificationDevice: {
        findMany: jest.fn().mockResolvedValue([]), // нет активных устройств
      },
      notificationDelivery: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const svc = new BroadcastDispatcherService(prisma as never, makeAudience());
    const count = await svc.materialize('b1');

    expect(count).toBe(2);
    expect(prisma.notification.createMany).toHaveBeenCalled();
    // Только u1 достижим по email и sms → 2 доставки; u2 — 0.
    const deliveryRows = prisma.notificationDelivery.createMany.mock.calls[0][0].data;
    expect(deliveryRows).toEqual(
      expect.arrayContaining([
        { notificationId: 'n1', channel: NotificationChannel.EMAIL, status: 'PENDING' },
        { notificationId: 'n1', channel: NotificationChannel.SMS, status: 'PENDING' },
      ]),
    );
    expect(deliveryRows).toHaveLength(2);
  });

  it('sets broadcast status to FAILED and rethrows when fanOut throws', async () => {
    const prisma = {
      broadcast: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }), // гард-переход OK
        findUnique: jest.fn().mockResolvedValue({
          id: 'b1',
          audienceType: 'ALL',
          targetUserId: null,
          language: null,
          filterStatus: null,
          filterRole: null,
          channels: [],
          title: 'T',
          body: 'B',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findMany: jest.fn().mockRejectedValue(new Error('db down')),
      },
      notification: { createMany: jest.fn() },
      notificationDevice: { findMany: jest.fn() },
      notificationDelivery: { createMany: jest.fn() },
    };
    const svc = new BroadcastDispatcherService(prisma as never, makeAudience());

    await expect(svc.materialize('b1')).rejects.toThrow('db down');
    expect(prisma.broadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });
});
