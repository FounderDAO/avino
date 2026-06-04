import { HttpException } from '@nestjs/common';
import {
  ListingStatus,
  PaymentStatus,
  Prisma,
  PromotionAdminAction,
  PromotionStatus,
  PromotionType,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AdminPromotionsService } from './admin-promotions.service';

/**
 * Юнит-тесты AdminPromotionsService (TASK-121). Prisma мокается. Проверяются:
 * расчёт expires_at по периоду, supersede предыдущей ACTIVE-промо, обновление
 * read-cache на listings, запись promotion_logs (дельта old→new) +
 * audit_logs, цена/валюта из каталога, маппинг snake_case, идемпотентность по
 * Idempotency-Key (pre-check и P2002-replay в гонке), 422 INVALID_PERIOD,
 * 404 для отсутствующего/DELETED листинга и история ledger'а.
 */
describe('AdminPromotionsService', () => {
  const ADMIN_ID = 'admin-1';
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';
  const PROMO_ID = '22222222-2222-2222-2222-222222222222';

  let prisma: any;
  let service: AdminPromotionsService;

  const createdRow = {
    id: PROMO_ID,
    listingId: LISTING_ID,
    type: PromotionType.VIP,
    status: PromotionStatus.ACTIVE,
    periodDays: 30,
    startsAt: new Date('2026-06-05T08:00:00.000Z'),
    expiresAt: new Date('2026-07-05T08:00:00.000Z'),
    paymentStatus: PaymentStatus.NOT_REQUIRED,
  };

  beforeEach(() => {
    prisma = {
      listing: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      listingPromotion: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue(createdRow),
        update: jest.fn(),
      },
      promotionLog: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    service = new AdminPromotionsService(prisma);
  });

  async function expectCode(promise: Promise<unknown>, code: ApiErrorCode) {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    try {
      await promise;
    } catch (e) {
      const res = (e as HttpException).getResponse() as { code: string };
      expect(res.code).toBe(code);
    }
  }

  describe('activate', () => {
    beforeEach(() => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.ACTIVE,
      });
    });

    it('creates an ACTIVE promotion, updates the cache, logs and audits', async () => {
      const result = await service.activate(ADMIN_ID, LISTING_ID, {
        type: PromotionType.VIP,
        period_days: 30,
      });

      // Новая промо: ACTIVE, период, цена/валюта из каталога, NOT_REQUIRED.
      const createArg = prisma.listingPromotion.create.mock.calls[0][0].data;
      expect(createArg).toMatchObject({
        listingId: LISTING_ID,
        userId: ADMIN_ID,
        type: PromotionType.VIP,
        status: PromotionStatus.ACTIVE,
        periodDays: 30,
        currency: 'UZS',
        paymentStatus: PaymentStatus.NOT_REQUIRED,
        paymentReference: null,
      });
      expect((createArg.price as Prisma.Decimal).toString()).toBe('350000');
      // expires_at = starts_at + 30 дней.
      const deltaMs =
        createArg.expiresAt.getTime() - createArg.startsAt.getTime();
      expect(deltaMs).toBe(30 * 24 * 60 * 60 * 1000);

      // Read-cache на listings синхронизирован с новой промо.
      expect(prisma.listing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LISTING_ID },
          data: expect.objectContaining({ promotionType: PromotionType.VIP }),
        }),
      );

      // Лог активации с дельтой (предыдущей ACTIVE не было → old* = null).
      expect(prisma.promotionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          listingPromotionId: PROMO_ID,
          listingId: LISTING_ID,
          adminId: ADMIN_ID,
          action: PromotionAdminAction.ACTIVATE_VIP,
          oldType: null,
          newType: PromotionType.VIP,
          oldExpiresAt: null,
        }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: ADMIN_ID,
          action: 'LISTING_PROMOTION_CHANGE',
          entityType: 'listing',
          entityId: LISTING_ID,
        }),
      });

      expect(result).toEqual({
        id: PROMO_ID,
        listing_id: LISTING_ID,
        type: PromotionType.VIP,
        status: PromotionStatus.ACTIVE,
        period_days: 30,
        starts_at: '2026-06-05T08:00:00.000Z',
        expires_at: '2026-07-05T08:00:00.000Z',
        payment_status: PaymentStatus.NOT_REQUIRED,
      });
    });

    it('supersedes the previous ACTIVE promotion and records the delta', async () => {
      const prevExpires = new Date('2026-06-20T00:00:00.000Z');
      prisma.listingPromotion.findFirst.mockResolvedValue({
        id: 'prev-promo',
        type: PromotionType.TOP,
        expiresAt: prevExpires,
      });

      await service.activate(ADMIN_ID, LISTING_ID, {
        type: PromotionType.VIP,
        period_days: 30,
      });

      // Предыдущая ACTIVE закрывается (→ CANCELLED), partial-unique сохранён.
      expect(prisma.listingPromotion.update).toHaveBeenCalledWith({
        where: { id: 'prev-promo' },
        data: { status: PromotionStatus.CANCELLED },
      });
      expect(prisma.promotionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldType: PromotionType.TOP,
          newType: PromotionType.VIP,
          oldExpiresAt: prevExpires,
        }),
      });
    });

    it('uses ACTIVATE_TOP for TOP activations', async () => {
      prisma.listingPromotion.create.mockResolvedValue({
        ...createdRow,
        type: PromotionType.TOP,
      });
      await service.activate(ADMIN_ID, LISTING_ID, {
        type: PromotionType.TOP,
        period_days: 7,
      });
      expect(prisma.promotionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: PromotionAdminAction.ACTIVATE_TOP,
        }),
      });
    });

    it('throws 422 INVALID_PERIOD for a period not in the catalog', async () => {
      await expectCode(
        service.activate(ADMIN_ID, LISTING_ID, {
          type: PromotionType.VIP,
          period_days: 10,
        }),
        ApiErrorCode.INVALID_PERIOD,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 404 when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectCode(
        service.activate(ADMIN_ID, LISTING_ID, {
          type: PromotionType.VIP,
          period_days: 30,
        }),
        ApiErrorCode.NOT_FOUND,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 404 when the listing is DELETED', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.DELETED,
      });
      await expectCode(
        service.activate(ADMIN_ID, LISTING_ID, {
          type: PromotionType.VIP,
          period_days: 30,
        }),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('replays the existing promotion for a repeated Idempotency-Key', async () => {
      prisma.listingPromotion.findFirst.mockResolvedValueOnce(createdRow);

      const result = await service.activate(
        ADMIN_ID,
        LISTING_ID,
        { type: PromotionType.VIP, period_days: 30 },
        'idem-key-1',
      );

      // Pre-check нашёл строку по payment_reference → ни записи, ни транзакции.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.listingPromotion.create).not.toHaveBeenCalled();
      expect(result.id).toBe(PROMO_ID);
    });

    it('persists the Idempotency-Key as payment_reference on first activation', async () => {
      await service.activate(
        ADMIN_ID,
        LISTING_ID,
        { type: PromotionType.VIP, period_days: 30 },
        'idem-key-2',
      );
      const createArg = prisma.listingPromotion.create.mock.calls[0][0].data;
      expect(createArg.paymentReference).toBe('idem-key-2');
    });

    it('replays on a P2002 race when the same Idempotency-Key is provided', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.$transaction.mockRejectedValueOnce(p2002);
      // Pre-check (до гонки) — null; повторный поиск после P2002 — найден.
      prisma.listingPromotion.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createdRow);

      const result = await service.activate(
        ADMIN_ID,
        LISTING_ID,
        { type: PromotionType.VIP, period_days: 30 },
        'idem-key-3',
      );
      expect(result.id).toBe(PROMO_ID);
    });

    it('maps a P2002 without an Idempotency-Key to 409 ACTIVE_PROMOTION_EXISTS', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.$transaction.mockRejectedValueOnce(p2002);
      await expectCode(
        service.activate(ADMIN_ID, LISTING_ID, {
          type: PromotionType.VIP,
          period_days: 30,
        }),
        ApiErrorCode.ACTIVE_PROMOTION_EXISTS,
      );
    });
  });

  describe('listHistory', () => {
    it('returns the ledger in snake_case ordered by created_at desc', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.ACTIVE,
      });
      prisma.listingPromotion.findMany.mockResolvedValue([createdRow]);

      const result = await service.listHistory(LISTING_ID);

      expect(prisma.listingPromotion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { listingId: LISTING_ID },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([
        {
          id: PROMO_ID,
          listing_id: LISTING_ID,
          type: PromotionType.VIP,
          status: PromotionStatus.ACTIVE,
          period_days: 30,
          starts_at: '2026-06-05T08:00:00.000Z',
          expires_at: '2026-07-05T08:00:00.000Z',
          payment_status: PaymentStatus.NOT_REQUIRED,
        },
      ]);
    });

    it('throws 404 when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectCode(service.listHistory(LISTING_ID), ApiErrorCode.NOT_FOUND);
    });
  });
});
