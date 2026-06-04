import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  MediaType,
  Prisma,
  PromotionType,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { ListingsService } from './listings.service';

/**
 * Юнит-тесты ListingsService (TASK-050). Prisma мокается — проверяются: создание
 * со статусом NEW + авторский перевод на original_language, маппинг scalar-полей,
 * ownership-гейт обновления (403 чужое / 404 отсутствующее) и snake_case ответ.
 */
describe('ListingsService', () => {
  const OWNER_ID = 'u1';
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';

  let prisma: any;
  let service: ListingsService;

  const dbListing = {
    id: LISTING_ID,
    status: ListingStatus.NEW,
    transactionType: TransactionType.RENT,
    propertyType: PropertyType.APARTMENT,
    originalLanguage: Language.RU,
    price: new Prisma.Decimal('4500000.00'),
    currency: Currency.UZS,
    createdAt: new Date('2026-06-02T08:00:00.000Z'),
  };

  const validCreate = {
    transaction_type: TransactionType.RENT,
    property_type: PropertyType.APARTMENT,
    original_language: Language.RU,
    price: '4500000.00',
    currency: Currency.UZS,
    area: '62.50',
    rooms: 2,
    translation: { title: '2-комн квартира', description: 'Светлая' },
  };

  beforeEach(() => {
    prisma = {
      listing: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new ListingsService(prisma);
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

  describe('create', () => {
    it('creates a NEW listing with the author translation and snake_case response', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      const result = await service.create(OWNER_ID, validCreate as any);

      expect(prisma.listing.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: OWNER_ID,
            status: ListingStatus.NEW,
            transactionType: TransactionType.RENT,
            propertyType: PropertyType.APARTMENT,
            originalLanguage: Language.RU,
            price: '4500000.00',
            currency: Currency.UZS,
            area: '62.50',
            rooms: 2,
            translations: {
              create: expect.objectContaining({
                language: Language.RU,
                source: TranslationSource.USER,
                isAutoTranslated: false,
                title: '2-комн квартира',
                description: 'Светлая',
              }),
            },
          }),
        }),
      );
      expect(result).toEqual({
        id: LISTING_ID,
        status: ListingStatus.NEW,
        transaction_type: TransactionType.RENT,
        property_type: PropertyType.APARTMENT,
        original_language: Language.RU,
        price: '4500000.00',
        currency: Currency.UZS,
        created_at: '2026-06-02T08:00:00.000Z',
      });
    });
  });

  describe('update', () => {
    it('updates own listing scalar fields and the author translation', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
      });
      prisma.listing.update.mockResolvedValue({
        ...dbListing,
        price: new Prisma.Decimal('4300000.00'),
      });

      const result = await service.update(OWNER_ID, LISTING_ID, {
        price: '4300000.00',
        translation: { title: 'Обновлённый заголовок' },
      } as any);

      expect(prisma.listing.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LISTING_ID },
          data: expect.objectContaining({
            price: '4300000.00',
            translations: {
              update: {
                where: {
                  listingId_language: {
                    listingId: LISTING_ID,
                    language: Language.RU,
                  },
                },
                data: { title: 'Обновлённый заголовок' },
              },
            },
          }),
        }),
      );
      expect(result.price).toBe('4300000.00');
    });

    it('does not touch translations when none provided', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
      });
      prisma.listing.update.mockResolvedValue(dbListing);

      await service.update(OWNER_ID, LISTING_ID, { rooms: 3 } as any);

      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.translations).toBeUndefined();
      expect(data.rooms).toBe(3);
    });

    it('throws 403 FORBIDDEN when the listing belongs to another user', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: 'other',
        originalLanguage: Language.RU,
      });

      const promise = service.update(OWNER_ID, LISTING_ID, { rooms: 3 } as any);
      await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
      await expectCode(
        service.update(OWNER_ID, LISTING_ID, { rooms: 3 } as any),
        ApiErrorCode.FORBIDDEN,
      );
      expect(prisma.listing.update).not.toHaveBeenCalled();
    });

    it('throws 404 NOT_FOUND when the listing is missing or DELETED', async () => {
      prisma.listing.findFirst.mockResolvedValue(null);

      const promise = service.update(OWNER_ID, LISTING_ID, { rooms: 3 } as any);
      await expect(promise).rejects.toBeInstanceOf(NotFoundException);
      await expectCode(
        service.update(OWNER_ID, LISTING_ID, { rooms: 3 } as any),
        ApiErrorCode.NOT_FOUND,
      );
      // DELETED исключается через status: { not: DELETED }.
      expect(prisma.listing.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: LISTING_ID,
            status: { not: ListingStatus.DELETED },
          },
        }),
      );
    });
  });

  describe('findOne', () => {
    const detailRow = {
      id: LISTING_ID,
      ownerId: OWNER_ID,
      agencyId: null,
      status: ListingStatus.ACTIVE,
      transactionType: TransactionType.RENT,
      propertyType: PropertyType.APARTMENT,
      originalLanguage: Language.RU,
      price: new Prisma.Decimal('4500000.00'),
      currency: Currency.UZS,
      area: new Prisma.Decimal('62.50'),
      rooms: 2,
      floor: 4,
      totalFloors: 9,
      yearBuilt: 2018,
      address: 'Yunusobod 12-23',
      cityId: 'c1',
      districtId: 'd1',
      latitude: new Prisma.Decimal('41.35'),
      longitude: new Prisma.Decimal('69.29'),
      promotionType: PromotionType.VIP,
      promotionExpiresAt: new Date('2026-06-20T00:00:00.000Z'),
      publishedAt: new Date('2026-06-01T10:00:00.000Z'),
      createdAt: new Date('2026-05-30T09:00:00.000Z'),
      translations: [
        {
          language: Language.RU,
          title: '2-комн квартира',
          description: 'Светлая',
          addressNote: 'рядом метро',
          featuresText: 'балкон',
        },
        {
          language: Language.EN,
          title: '2-room apartment',
          description: 'Bright',
          addressNote: 'near metro',
          featuresText: 'balcony',
        },
      ],
      media: [
        {
          id: 'm1',
          url: 'https://cdn.avino.uz/l1/1.webp',
          thumbnailUrl: 'https://cdn.avino.uz/l1/1_thumb.webp',
          sortOrder: 0,
          type: MediaType.IMAGE,
        },
      ],
    };

    const moderator: AuthenticatedUser = {
      id: 'mod',
      roles: [UserRole.MODERATOR],
    };

    it('returns an ACTIVE listing to a guest with translations and media (Decimal/date as strings)', async () => {
      prisma.listing.findUnique.mockResolvedValue(detailRow);

      const result = await service.findOne(LISTING_ID, undefined);

      expect(prisma.listing.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LISTING_ID } }),
      );
      expect(result).toMatchObject({
        id: LISTING_ID,
        status: ListingStatus.ACTIVE,
        price: '4500000.00',
        area: '62.50',
        latitude: '41.350000',
        longitude: '69.290000',
        promotion_type: PromotionType.VIP,
        promotion_expires_at: '2026-06-20T00:00:00.000Z',
        owner_id: OWNER_ID,
        language: Language.RU,
        title: '2-комн квартира',
        features_text: 'балкон',
        published_at: '2026-06-01T10:00:00.000Z',
        created_at: '2026-05-30T09:00:00.000Z',
      });
      expect(result.media).toEqual([
        {
          id: 'm1',
          url: 'https://cdn.avino.uz/l1/1.webp',
          thumbnail_url: 'https://cdn.avino.uz/l1/1_thumb.webp',
          sort_order: 0,
          type: MediaType.IMAGE,
        },
      ]);
    });

    it('selects the requested ?lang translation', async () => {
      prisma.listing.findUnique.mockResolvedValue(detailRow);

      const result = await service.findOne(LISTING_ID, undefined, 'en');

      expect(result.language).toBe(Language.EN);
      expect(result.title).toBe('2-room apartment');
    });

    it('falls back to original_language when requested lang has no translation', async () => {
      prisma.listing.findUnique.mockResolvedValue(detailRow);

      // UZ перевода нет → фолбэк на original_language (RU), ADR-012.
      const result = await service.findOne(LISTING_ID, undefined, 'uz');

      expect(result.language).toBe(Language.RU);
    });

    it('uses Accept-Language when ?lang is absent', async () => {
      prisma.listing.findUnique.mockResolvedValue(detailRow);

      const result = await service.findOne(
        LISTING_ID,
        undefined,
        undefined,
        'en-US,en;q=0.9,ru;q=0.8',
      );

      expect(result.language).toBe(Language.EN);
    });

    it('throws 404 NOT_FOUND when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(LISTING_ID, undefined),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expectCode(
        service.findOne(LISTING_ID, undefined),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('hides a DELETED listing even from the owner (404)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        status: ListingStatus.DELETED,
      });

      await expectCode(
        service.findOne(LISTING_ID, { id: OWNER_ID, roles: [] }),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('hides a non-ACTIVE listing from a guest (404)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        status: ListingStatus.NEW,
      });

      await expectCode(
        service.findOne(LISTING_ID, undefined),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('hides a non-ACTIVE listing from another user (404)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        status: ListingStatus.NEW,
      });

      await expectCode(
        service.findOne(LISTING_ID, { id: 'other', roles: [UserRole.USER] }),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('shows a non-ACTIVE listing to its owner', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        status: ListingStatus.NEW,
      });

      const result = await service.findOne(LISTING_ID, {
        id: OWNER_ID,
        roles: [],
      });

      expect(result.status).toBe(ListingStatus.NEW);
    });

    it('shows a non-ACTIVE listing to a MODERATOR/ADMIN', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        status: ListingStatus.DRAFT,
      });

      const result = await service.findOne(LISTING_ID, moderator);

      expect(result.status).toBe(ListingStatus.DRAFT);
    });
  });
});
