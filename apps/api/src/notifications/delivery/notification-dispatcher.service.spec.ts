import {
  Language,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';
import { NotificationDispatcherService } from './notification-dispatcher.service';

// ---------------------------------------------------------------------------
// Helpers: build minimal prisma mock
// ---------------------------------------------------------------------------

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    appSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notificationDelivery: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    notificationDevice: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function buildConfig(values: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    'notifications.emailEnabled': true,
    'notifications.pushEnabled': true,
    'notifications.dispatchLookbackMin': 60,
    'notifications.dispatchBatch': 200,
    'notifications.dispatchConcurrency': 1,
    'notifications.emailChatThrottleMin': 30,
  };
  return {
    get: jest.fn((key: string) => values[key] ?? defaults[key]),
  };
}

function buildRenderer(emailResult = null as unknown, pushResult = null as unknown) {
  return {
    renderEmail: jest.fn().mockResolvedValue(emailResult),
    renderPush: jest.fn().mockResolvedValue(pushResult),
  };
}

function buildFcm(result: { successCount: number; invalidTokens: string[] } = { successCount: 1, invalidTokens: [] }) {
  return {
    send: jest.fn().mockResolvedValue(result),
  };
}

function buildEmailService() {
  return {
    sendEmail: jest.fn().mockResolvedValue(undefined),
  };
}

/** Фабрика минимального notification для findMany в fan-out. */
function makeNotification(
  type: NotificationType,
  dataJson: Record<string, unknown> = {},
  existingChannels: NotificationChannel[] = [],
) {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type,
    dataJson,
    createdAt: new Date(),
    deliveries: existingChannels.map((ch) => ({ channel: ch })),
  };
}

/** Фабрика минимальной delivery для findMany в deliver. */
function makeDelivery(
  channel: NotificationChannel,
  status: NotificationStatus = NotificationStatus.PENDING,
  attempts = 0,
) {
  return {
    id: 'delivery-1',
    channel,
    status,
    attempts,
    notification: {
      id: 'notif-1',
      type: NotificationType.NEW_LEAD,
      dataJson: { listing_id: 'listing-1' },
      user: {
        id: 'user-1',
        email: 'user@example.com',
        defaultLanguage: Language.RU,
        profile: { preferredLanguage: null },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationDispatcherService', () => {
  // (a) Fan-out creates EMAIL + PUSH deliveries for NEW_LEAD
  it('(a) fan-out creates EMAIL + PUSH deliveries for NEW_LEAD', async () => {
    const prisma = buildPrisma();
    const config = buildConfig();
    const renderer = buildRenderer(
      { subject: 'S', html: '<p>H</p>', text: 'T' },
      { title: 'T', body: 'B', data: {} },
    );
    const fcm = buildFcm();
    const emailService = buildEmailService();

    (prisma.notification.findMany as jest.Mock).mockResolvedValue([
      makeNotification(NotificationType.NEW_LEAD),
    ]);
    // deliver: no pending deliveries
    (prisma.notificationDelivery.findMany as jest.Mock).mockResolvedValue([]);

    const service = new NotificationDispatcherService(
      prisma as never,
      config as never,
      renderer as never,
      fcm as never,
      emailService as never,
    );

    await service.run();

    // Should create EMAIL and PUSH deliveries (channelsFor(NEW_LEAD) = [EMAIL, PUSH])
    expect(prisma.notificationDelivery.create).toHaveBeenCalledTimes(2);
    const channels = (prisma.notificationDelivery.create as jest.Mock).mock.calls.map(
      (call: [{ data: { channel: NotificationChannel } }]) => call[0].data.channel,
    );
    expect(channels).toContain(NotificationChannel.EMAIL);
    expect(channels).toContain(NotificationChannel.PUSH);
  });

  // (b) Second run is idempotent — no duplicate deliveries
  it('(b) second run does not create duplicate deliveries (already exist)', async () => {
    const prisma = buildPrisma();
    const config = buildConfig();
    const renderer = buildRenderer();
    const fcm = buildFcm();
    const emailService = buildEmailService();

    // Both channels already have deliveries
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([
      makeNotification(NotificationType.NEW_LEAD, {}, [
        NotificationChannel.EMAIL,
        NotificationChannel.PUSH,
      ]),
    ]);
    (prisma.notificationDelivery.findMany as jest.Mock).mockResolvedValue([]);

    const service = new NotificationDispatcherService(
      prisma as never,
      config as never,
      renderer as never,
      fcm as never,
      emailService as never,
    );

    await service.run();

    // No new deliveries created since both channels already exist
    expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
  });

  // (c) EMAIL globally disabled → delivery stays PENDING, sendEmail NOT called
  it('(c) email globally disabled → leave PENDING, sendEmail NOT called', async () => {
    const prisma = buildPrisma();
    const config = buildConfig({ 'notifications.emailEnabled': false });
    const renderer = buildRenderer(
      { subject: 'S', html: '<p>H</p>', text: 'T' },
      null,
    );
    const fcm = buildFcm();
    const emailService = buildEmailService();

    // Fan-out: no notifications
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    // Deliver: one pending EMAIL delivery
    (prisma.notificationDelivery.findMany as jest.Mock).mockResolvedValue([
      makeDelivery(NotificationChannel.EMAIL),
    ]);

    const service = new NotificationDispatcherService(
      prisma as never,
      config as never,
      renderer as never,
      fcm as never,
      emailService as never,
    );

    await service.run();

    // Email disabled → delivery untouched (no update, no sendEmail)
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
  });

  // (d) NEW_CHAT_MESSAGE email throttled within window → no second EMAIL delivery created
  it('(d) NEW_CHAT_MESSAGE email throttled within window → no second delivery', async () => {
    const prisma = buildPrisma();
    const config = buildConfig();
    const renderer = buildRenderer();
    const fcm = buildFcm();
    const emailService = buildEmailService();

    // Notification: chat message, no existing deliveries yet
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([
      makeNotification(NotificationType.NEW_CHAT_MESSAGE, { thread_id: 'thread-1' }),
    ]);
    (prisma.notificationDelivery.findMany as jest.Mock).mockResolvedValue([]);

    // Throttle check returns existing delivery → throttle applies for EMAIL
    (prisma.notificationDelivery.findFirst as jest.Mock).mockResolvedValue({
      id: 'delivery-old',
    });

    const service = new NotificationDispatcherService(
      prisma as never,
      config as never,
      renderer as never,
      fcm as never,
      emailService as never,
    );

    await service.run();

    // Only PUSH delivery should be created (EMAIL throttled)
    const createCalls = (prisma.notificationDelivery.create as jest.Mock).mock.calls;
    const createdChannels = createCalls.map(
      (call: [{ data: { channel: NotificationChannel } }]) => call[0].data.channel,
    );
    expect(createdChannels).not.toContain(NotificationChannel.EMAIL);
    expect(createdChannels).toContain(NotificationChannel.PUSH);
  });

  // (e) PUSH with invalid token → device deactivated + delivery resolved (FAILED = 0 successes)
  it('(e) PUSH invalid token → device deactivated', async () => {
    const prisma = buildPrisma();
    const config = buildConfig();
    const renderer = buildRenderer(null, { title: 'T', body: 'B', data: {} });
    const fcm = buildFcm({ successCount: 0, invalidTokens: ['bad-token'] });
    const emailService = buildEmailService();

    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notificationDelivery.findMany as jest.Mock).mockResolvedValue([
      makeDelivery(NotificationChannel.PUSH),
    ]);
    (prisma.notificationDevice.findMany as jest.Mock).mockResolvedValue([
      { pushToken: 'bad-token' },
    ]);

    const service = new NotificationDispatcherService(
      prisma as never,
      config as never,
      renderer as never,
      fcm as never,
      emailService as never,
    );

    await service.run();

    // Invalid token should be deactivated
    expect(prisma.notificationDevice.updateMany).toHaveBeenCalledWith({
      where: { pushToken: { in: ['bad-token'] } },
      data: { isActive: false },
    });

    // Delivery should be marked FAILED (successCount = 0)
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: NotificationStatus.FAILED }),
      }),
    );
  });

  // (f) FAILED delivery with attempts >= 3 is not retried
  it('(f) FAILED delivery with attempts >= 3 is not retried', async () => {
    const prisma = buildPrisma();
    const config = buildConfig();
    const renderer = buildRenderer();
    const fcm = buildFcm();
    const emailService = buildEmailService();

    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    // findMany for deliver: FAILED with attempts = 3 should NOT appear because
    // the query filters attempts < 3. We simulate this by returning empty.
    (prisma.notificationDelivery.findMany as jest.Mock).mockResolvedValue([]);

    const service = new NotificationDispatcherService(
      prisma as never,
      config as never,
      renderer as never,
      fcm as never,
      emailService as never,
    );

    await service.run();

    // Verify the query uses attempts < 3 filter
    const findManyCall = (prisma.notificationDelivery.findMany as jest.Mock).mock
      .calls[0][0];
    const failedFilter = findManyCall?.where?.OR?.find(
      (c: { status?: NotificationStatus; attempts?: { lt?: number } }) =>
        c.status === NotificationStatus.FAILED,
    );
    expect(failedFilter?.attempts?.lt).toBe(3);

    // No sendEmail or FCM send called
    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(fcm.send).not.toHaveBeenCalled();
  });
});
