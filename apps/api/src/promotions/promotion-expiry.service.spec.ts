import { ConfigService } from '@nestjs/config';
import { PromotionStatus, PromotionType } from '@prisma/client';
import { PromotionExpiryService } from './promotion-expiry.service';

/**
 * Юнит-тесты PromotionExpiryService (TASK-123). Prisma и NotificationsService
 * мокаются. Проверяются: выборка только просроченных ACTIVE-промо, условный флип
 * `ACTIVE → EXPIRED` (idempotent — count=0 пропускается), сброс read-cache на
 * listings в NORMAL с гардом `promotion_expires_at <= now()` (не затирает свежую
 * ре-активацию), постановка PENDING-уведомления владельцу и системный audit_log
 * (`actor_id = null`), а также изоляция ошибок по одной промо.
 */
describe('PromotionExpiryService', () => {
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';
  const PROMO_ID = '22222222-2222-2222-2222-222222222222';
  const OWNER_ID = '33333333-3333-3333-3333-333333333333';

  let prisma: any;
  let notifications: { queuePromotionExpired: jest.Mock };
  let service: PromotionExpiryService;

  const config = (batchSize?: number): ConfigService =>
    ({
      get: (key: string) =>
        key === 'promotion.expiryBatchSize' ? batchSize : undefined,
    }) as unknown as ConfigService;

  const duePromo = (over: Record<string, unknown> = {}) => ({
    id: PROMO_ID,
    listingId: LISTING_ID,
    type: PromotionType.VIP,
    expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    listing: { ownerId: OWNER_ID },
    ...over,
  });

  beforeEach(() => {
    prisma = {
      listingPromotion: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      listing: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    notifications = { queuePromotionExpired: jest.fn() };
    service = new PromotionExpiryService(
      prisma,
      notifications as any,
      config(50),
    );
  });

  it('selects only ACTIVE promotions that have expired, bounded by batch size', async () => {
    await service.run();

    expect(prisma.listingPromotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PromotionStatus.ACTIVE,
          expiresAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
        take: 50,
      }),
    );
  });

  it('expires a due promotion: EXPIRED, cache → NORMAL, notification, audit', async () => {
    prisma.listingPromotion.findMany.mockResolvedValue([duePromo()]);

    const count = await service.run();

    expect(count).toBe(1);

    // 1. условный флип статуса в EXPIRED
    expect(prisma.listingPromotion.updateMany).toHaveBeenCalledWith({
      where: { id: PROMO_ID, status: PromotionStatus.ACTIVE },
      data: { status: PromotionStatus.EXPIRED },
    });

    // 2. сброс read-cache → NORMAL с гардом по времени
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: {
        id: LISTING_ID,
        promotionExpiresAt: { lte: expect.any(Date) },
      },
      data: {
        promotionType: PromotionType.NORMAL,
        promotionStartedAt: null,
        promotionExpiresAt: null,
      },
    });

    // 3. PENDING-уведомление владельцу
    expect(notifications.queuePromotionExpired).toHaveBeenCalledWith(
      prisma,
      OWNER_ID,
      expect.objectContaining({
        listingId: LISTING_ID,
        promotionId: PROMO_ID,
        promotionType: PromotionType.VIP,
      }),
    );

    // 4. системный audit_log (actor_id = null)
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: null,
          action: 'LISTING_PROMOTION_EXPIRE',
          entityId: LISTING_ID,
        }),
      }),
    );
  });

  it('skips a promotion already handled concurrently (flip count = 0)', async () => {
    prisma.listingPromotion.findMany.mockResolvedValue([duePromo()]);
    prisma.listingPromotion.updateMany.mockResolvedValue({ count: 0 });

    const count = await service.run();

    expect(count).toBe(0);
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
    expect(notifications.queuePromotionExpired).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('isolates a per-promotion failure and keeps processing the rest', async () => {
    prisma.listingPromotion.findMany.mockResolvedValue([
      duePromo({ id: 'p-fail' }),
      duePromo({ id: 'p-ok' }),
    ]);
    prisma.$transaction
      .mockRejectedValueOnce(new Error('db blip'))
      .mockImplementation(async (cb: any) => cb(prisma));

    const count = await service.run();

    expect(count).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('defaults batch size to 100 when not configured', async () => {
    service = new PromotionExpiryService(
      prisma,
      notifications as any,
      config(undefined),
    );

    await service.run();

    expect(prisma.listingPromotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});
