import { HttpException } from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  ModerationAction,
  NotificationChannel,
  NotificationType,
  Prisma,
  PropertyType,
  TransactionType,
  UserStatus,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { ModerationService } from './moderation.service';

/**
 * Юнит-тесты ModerationService (TASK-053). Prisma мокается. Проверяются:
 * админ-список с фильтрами и пагинацией, маппинг action→status, гейты переходов
 * (404 отсутствующее/DELETED, 422 не-модерируемый/тот же статус), атомарная
 * запись moderation_logs + audit_logs + постановки уведомления владельцу,
 * выставление published_at при первой публикации и история модерации.
 */
describe('ModerationService', () => {
  const MODERATOR_ID = 'mod-1';
  const OWNER_ID = 'owner-1';
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';

  let prisma: any;
  let translationQueue: { enqueueListingTranslation: jest.Mock };
  let service: ModerationService;

  const dbListItem = {
    id: LISTING_ID,
    ownerId: OWNER_ID,
    status: ListingStatus.NEW,
    transactionType: TransactionType.RENT,
    propertyType: PropertyType.APARTMENT,
    originalLanguage: Language.RU,
    price: new Prisma.Decimal('4500000.00'),
    currency: Currency.UZS,
    cityId: 'city-1',
    districtId: null,
    publishedAt: null,
    createdAt: new Date('2026-06-02T08:00:00.000Z'),
    translations: [{ language: Language.RU, title: '2-комн квартира' }],
    owner: {
      id: OWNER_ID,
      email: 'seller@example.com',
      phone: '+998901234567',
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
      roles: [{ role: { code: 'OWNER' } }],
      profile: {
        firstName: 'Алишер',
        lastName: 'Усманов',
        displayName: 'Алишер У.',
        contactPhone: '+998907654321',
      },
    },
  };

  beforeEach(() => {
    prisma = {
      listing: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      moderationLog: { create: jest.fn(), findMany: jest.fn() },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() },
      // Интерактивная транзакция: коллбэк получает тот же мок (tx === prisma).
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    translationQueue = { enqueueListingTranslation: jest.fn() };
    service = new ModerationService(prisma, translationQueue as any);
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

  describe('listListings', () => {
    it('returns a paginated snake_case list with owner_id and meta.total', async () => {
      prisma.listing.findMany.mockResolvedValue([dbListItem]);
      prisma.listing.count.mockResolvedValue(1);

      const result = await service.listListings({ status: ListingStatus.NEW });

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ListingStatus.NEW },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 20,
        }),
      );
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(result.data[0]).toMatchObject({
        id: LISTING_ID,
        owner_id: OWNER_ID,
        status: ListingStatus.NEW,
        price: '4500000.00',
        title: '2-комн квартира',
        original_language: Language.RU,
      });
    });

    it('exposes the inline owner profile (name, contact, roles, status, registered)', async () => {
      prisma.listing.findMany.mockResolvedValue([dbListItem]);
      prisma.listing.count.mockResolvedValue(1);

      const result = await service.listListings({ status: ListingStatus.NEW });

      expect(result.data[0].owner).toEqual({
        id: OWNER_ID,
        display_name: 'Алишер У.',
        first_name: 'Алишер',
        last_name: 'Усманов',
        email: 'seller@example.com',
        phone: '+998901234567',
        contact_phone: '+998907654321',
        status: UserStatus.ACTIVE,
        roles: ['OWNER'],
        created_at: '2026-05-20T10:00:00.000Z',
      });
    });

    it('maps a missing profile to null name/contact fields', async () => {
      prisma.listing.findMany.mockResolvedValue([
        { ...dbListItem, owner: { ...dbListItem.owner, profile: null } },
      ]);
      prisma.listing.count.mockResolvedValue(1);

      const result = await service.listListings({ status: ListingStatus.NEW });

      expect(result.data[0].owner).toMatchObject({
        display_name: null,
        first_name: null,
        last_name: null,
        contact_phone: null,
        email: 'seller@example.com',
      });
    });

    it('combines property_type, transaction_type and q filters', async () => {
      prisma.listing.findMany.mockResolvedValue([]);
      prisma.listing.count.mockResolvedValue(0);

      await service.listListings({
        property_type: PropertyType.APARTMENT,
        transaction_type: TransactionType.SALE,
        q: 'квартира',
        page: 2,
        limit: 10,
      });

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            propertyType: PropertyType.APARTMENT,
            transactionType: TransactionType.SALE,
            translations: {
              some: { title: { contains: 'квартира', mode: 'insensitive' } },
            },
          },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('changeStatus', () => {
    it('APPROVE publishes the listing, logs and queues an owner notification', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.NEW,
        publishedAt: null,
      });
      prisma.listing.update.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.ACTIVE,
        publishedAt: new Date('2026-06-04T10:00:00.000Z'),
      });

      const result = await service.changeStatus(MODERATOR_ID, LISTING_ID, {
        action: ModerationAction.APPROVE,
      });

      expect(prisma.listing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LISTING_ID },
          data: expect.objectContaining({ status: ListingStatus.ACTIVE }),
        }),
      );
      // published_at выставлен (был null) — Date.
      const updateArg = prisma.listing.update.mock.calls[0][0];
      expect(updateArg.data.publishedAt).toBeInstanceOf(Date);

      expect(prisma.moderationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          listingId: LISTING_ID,
          moderatorId: MODERATOR_ID,
          action: ModerationAction.APPROVE,
          oldStatus: ListingStatus.NEW,
          newStatus: ListingStatus.ACTIVE,
          reason: null,
        }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: MODERATOR_ID,
          action: 'LISTING_STATUS_CHANGE',
          entityType: 'listing',
          entityId: LISTING_ID,
        }),
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: OWNER_ID,
          type: NotificationType.LISTING_MODERATION_STATUS_CHANGED,
          channel: NotificationChannel.EMAIL,
        }),
      });
      expect(result).toEqual({
        id: LISTING_ID,
        status: ListingStatus.ACTIVE,
        published_at: '2026-06-04T10:00:00.000Z',
      });
      // APPROVE→ACTIVE triggers auto-translation (TASK-071, ADR-005).
      expect(translationQueue.enqueueListingTranslation).toHaveBeenCalledWith(
        LISTING_ID,
      );
    });

    it('keeps the existing published_at when re-approving a DRAFT listing', async () => {
      const firstPublished = new Date('2026-06-01T00:00:00.000Z');
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.DRAFT,
        publishedAt: firstPublished,
      });
      prisma.listing.update.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.ACTIVE,
        publishedAt: firstPublished,
      });

      await service.changeStatus(MODERATOR_ID, LISTING_ID, {
        action: ModerationAction.APPROVE,
      });

      const updateArg = prisma.listing.update.mock.calls[0][0];
      expect(updateArg.data.publishedAt).toBe(firstPublished);
    });

    it('REJECT records the reason and does not set published_at', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.NEW,
        publishedAt: null,
      });
      prisma.listing.update.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.REJECTED,
        publishedAt: null,
      });

      const result = await service.changeStatus(MODERATOR_ID, LISTING_ID, {
        action: ModerationAction.REJECT,
        reason: 'недостаточно фото',
      });

      const updateArg = prisma.listing.update.mock.calls[0][0];
      expect(updateArg.data.publishedAt).toBeNull();
      expect(prisma.moderationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          newStatus: ListingStatus.REJECTED,
          reason: 'недостаточно фото',
        }),
      });
      expect(result.published_at).toBeNull();
      // Non-ACTIVE transitions must not enqueue auto-translation.
      expect(translationQueue.enqueueListingTranslation).not.toHaveBeenCalled();
    });

    it('does not enqueue auto-translation when the queue insert fails after commit', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.NEW,
        publishedAt: null,
      });
      prisma.listing.update.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.ACTIVE,
        publishedAt: new Date('2026-06-04T10:00:00.000Z'),
      });
      translationQueue.enqueueListingTranslation.mockRejectedValue(
        new Error('redis down'),
      );

      // A failed enqueue must not fail the moderation response — the listing
      // is already ACTIVE and a missed job can be re-triggered.
      const result = await service.changeStatus(MODERATOR_ID, LISTING_ID, {
        action: ModerationAction.APPROVE,
      });
      expect(result.status).toBe(ListingStatus.ACTIVE);
    });

    it('throws 404 when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectCode(
        service.changeStatus(MODERATOR_ID, LISTING_ID, {
          action: ModerationAction.APPROVE,
        }),
        ApiErrorCode.NOT_FOUND,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 404 when the listing is already DELETED', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.DELETED,
        publishedAt: null,
      });
      await expectCode(
        service.changeStatus(MODERATOR_ID, LISTING_ID, {
          action: ModerationAction.APPROVE,
        }),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('throws 422 for a non-moderatable source status (SOLD)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.SOLD,
        publishedAt: new Date(),
      });
      await expectCode(
        service.changeStatus(MODERATOR_ID, LISTING_ID, {
          action: ModerationAction.APPROVE,
        }),
        ApiErrorCode.INVALID_STATUS_TRANSITION,
      );
    });

    it('throws 422 when the target status equals the current status', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.ACTIVE,
        publishedAt: new Date(),
      });
      await expectCode(
        service.changeStatus(MODERATOR_ID, LISTING_ID, {
          action: ModerationAction.APPROVE,
        }),
        ApiErrorCode.INVALID_STATUS_TRANSITION,
      );
    });
  });

  describe('findLogs', () => {
    it('returns moderation history in snake_case', async () => {
      prisma.listing.findUnique.mockResolvedValue({ id: LISTING_ID });
      prisma.moderationLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          action: ModerationAction.APPROVE,
          oldStatus: ListingStatus.NEW,
          newStatus: ListingStatus.ACTIVE,
          moderatorId: MODERATOR_ID,
          reason: null,
          createdAt: new Date('2026-06-04T10:00:00.000Z'),
        },
      ]);

      const result = await service.findLogs(LISTING_ID);

      expect(result).toEqual([
        {
          id: 'log-1',
          action: ModerationAction.APPROVE,
          old_status: ListingStatus.NEW,
          new_status: ListingStatus.ACTIVE,
          moderator_id: MODERATOR_ID,
          reason: null,
          created_at: '2026-06-04T10:00:00.000Z',
        },
      ]);
    });

    it('throws 404 when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectCode(service.findLogs(LISTING_ID), ApiErrorCode.NOT_FOUND);
    });
  });
});
