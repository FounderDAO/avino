import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  Prisma,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
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
});
