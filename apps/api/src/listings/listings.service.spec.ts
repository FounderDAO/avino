import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  Amenity,
  Currency,
  Language,
  ListingStatus,
  MediaType,
  ParkingType,
  Prisma,
  PromotionType,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { AddressResolverService, DistrictsService } from '../geo';
import { ActiveListingLimitService } from '../settings';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
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
  let activeLimit: { getLimit: jest.Mock };
  let addressResolver: { resolve: jest.Mock };
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
    bathrooms: 2,
    translation: { title: '2-комн квартира', description: 'Светлая' },
  };

  beforeEach(() => {
    prisma = {
      listing: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      // Авто-апгрейд автора до OWNER при первом объявлении (ADR-0083). Дефолт —
      // «уже продавец» (count>0), чтобы базовый тест create фокусировался на
      // записи листинга; кейсы апгрейда переопределяют count.
      userRole: {
        count: jest.fn().mockResolvedValue(1),
        upsert: jest.fn().mockResolvedValue({}),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'role-owner' }),
      },
      // История цены (ADR-0121): create()/update() пишут строку в той же
      // транзакции — мок нужен во всех сценариях, не только в price-history тестах.
      listingPriceHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
      // Гейт полноты профиля (ADR-0125): create() читает автора с профилем.
      // Дефолт — полный профиль, чтобы остальные create-тесты не задевало.
      user: {
        findUnique: jest.fn().mockResolvedValue({
          phone: '+998901234567',
          profile: { firstName: 'Али', lastName: 'Валиев', contactPhone: null },
        }),
      },
    };
    // create() оборачивает апгрейд роли + запись листинга в один $transaction;
    // мок прокидывает тот же prisma как tx-клиент (callback-форма).
    prisma.$transaction = jest.fn().mockImplementation((cb: any) => cb(prisma));
    // registerView — raw UPDATE (не трогает @updatedAt), см. describe('registerView').
    prisma.$executeRaw = jest.fn();
    // Реальный TranslationsService (логика переводов делегирована ему, TASK-070);
    // его resolveLanguage/buildOriginalTranslationInput чисты, prisma не вызывают.
    // DistrictsService застаблен — резолв district_name проверяется в int-spec.
    const districts = {
      namesByIds: jest.fn().mockResolvedValue(new Map()),
      pickName: jest.fn().mockReturnValue(null),
    } as unknown as DistrictsService;
    // UploadsService застаблен: отдача всегда через свежий presigned URL
    // (ADR-0086). По умолчанию echo (key ?? url) — существующие url/thumbnail
    // ассерты остаются валидными; вызов resolveMediaUrl проверяется отдельно.
    const uploads = {
      resolveMediaUrl: jest.fn((key: string | null | undefined, url: string) =>
        Promise.resolve(key ?? url),
      ),
    } as unknown as UploadsService;
    // Лимит активных объявлений (ADR-…): дефолт 2. Базовые create-тесты держат
    // userRole.count=1 (автор трактуется как «продавец/pro») → квота пропускает
    // проверку; кейсы лимита ниже переопределяют getLimit + listing.count.
    activeLimit = { getLimit: jest.fn().mockResolvedValue(2) };
    // AddressResolver (ADR-0147): дефолт «геокодер недоступен» (null) — базовые
    // тесты create идут строковым фолбэком; геокод-кейсы переопределяют resolve.
    addressResolver = { resolve: jest.fn().mockResolvedValue(null) };
    service = new ListingsService(
      prisma,
      new TranslationsService(prisma),
      districts,
      uploads,
      activeLimit as unknown as ActiveListingLimitService,
      addressResolver as unknown as AddressResolverService,
    );
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
            bathrooms: 2,
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
      // Автор уже продавец (дефолт count>0) — роль не трогаем.
      expect(prisma.userRole.upsert).not.toHaveBeenCalled();
    });

    it('passes parking_type through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        parking_type: ParkingType.GARAGE,
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.parkingType).toBe(ParkingType.GARAGE);
    });

    it('passes lot_area through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        lot_area: '5.50',
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.lotArea).toBe('5.50');
    });

    it('passes living_area/non_living_area through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        living_area: '95.00',
        non_living_area: '25.50',
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.livingArea).toBe('95.00');
      expect(data.nonLivingArea).toBe('25.50');
    });

    it('auto-grants the OWNER role when the author has no seller role (first listing)', async () => {
      prisma.userRole.count.mockResolvedValue(0); // ни одной продавцовской роли
      prisma.role.findUnique.mockResolvedValue({ id: 'role-owner' });
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, validCreate as any);

      expect(prisma.role.findUnique).toHaveBeenCalledWith({
        where: { code: UserRole.OWNER },
        select: { id: true },
      });
      expect(prisma.userRole.upsert).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: OWNER_ID, roleId: 'role-owner' } },
        create: { userId: OWNER_ID, roleId: 'role-owner' },
        update: {},
      });
      expect(prisma.listing.create).toHaveBeenCalled();
    });

    it('does not grant OWNER when the author already has a seller role', async () => {
      prisma.userRole.count.mockResolvedValue(1); // напр. уже AGENT/AGENCY
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, validCreate as any);

      expect(prisma.role.findUnique).not.toHaveBeenCalled();
      expect(prisma.userRole.upsert).not.toHaveBeenCalled();
      expect(prisma.listing.create).toHaveBeenCalled();
    });

    it('still creates the listing when the OWNER role is not seeded (best-effort upgrade)', async () => {
      prisma.userRole.count.mockResolvedValue(0);
      prisma.role.findUnique.mockResolvedValue(null);
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, validCreate as any);

      expect(prisma.userRole.upsert).not.toHaveBeenCalled();
      expect(prisma.listing.create).toHaveBeenCalled();
    });

    it('passes fractional bathrooms (1.5) through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        bathrooms: 1.5,
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.bathrooms).toBe(1.5);
    });

    it('passes is_basement through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        is_basement: true,
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.isBasement).toBe(true);
    });

    it('writes the initial price-history row inside the create transaction', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, validCreate as any);

      expect(prisma.listingPriceHistory.create).toHaveBeenCalledWith({
        data: {
          listingId: LISTING_ID,
          price: '4500000.00',
          currency: Currency.UZS,
        },
      });
    });
  });

  describe('create — profile completeness gate (ADR-0125)', () => {
    it('rejects with 422 PROFILE_INCOMPLETE when first_name is missing', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: '+998901234567',
        profile: { firstName: null, lastName: 'Валиев', contactPhone: null },
      });
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.PROFILE_INCOMPLETE,
      );
      expect(prisma.listing.create).not.toHaveBeenCalled();
    });

    it('rejects with 422 PROFILE_INCOMPLETE when last_name is blank', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: '+998901234567',
        profile: { firstName: 'Али', lastName: '   ', contactPhone: null },
      });
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.PROFILE_INCOMPLETE,
      );
    });

    it('rejects with 422 PROFILE_INCOMPLETE when both phones are missing (Google user)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: null,
        profile: { firstName: 'Али', lastName: 'Валиев', contactPhone: null },
      });
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.PROFILE_INCOMPLETE,
      );
    });

    it('rejects with 422 PROFILE_INCOMPLETE when the profile row is absent', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: '+998901234567',
        profile: null,
      });
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.PROFILE_INCOMPLETE,
      );
    });

    it('creates when names are set and only account phone exists (phone-login user)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: '+998901234567',
        profile: { firstName: 'Али', lastName: 'Валиев', contactPhone: null },
      });
      prisma.listing.create.mockResolvedValue(dbListing);
      await expect(service.create(OWNER_ID, validCreate as any)).resolves.toBeDefined();
    });

    it('creates when contact_phone is set and account phone is null (Google user)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: null,
        profile: { firstName: 'Али', lastName: 'Валиев', contactPhone: '+998907654321' },
      });
      prisma.listing.create.mockResolvedValue(dbListing);
      await expect(service.create(OWNER_ID, validCreate as any)).resolves.toBeDefined();
    });
  });

  describe('create — active listing limit', () => {
    it('rejects with 422 ACTIVE_LISTING_LIMIT_REACHED when the client is at the limit', async () => {
      prisma.userRole.count.mockResolvedValue(0); // обычный клиент (не AGENT/AGENCY)
      activeLimit.getLimit.mockResolvedValue(2);
      prisma.listing.count.mockResolvedValue(2); // уже 2 активных (ACTIVE+NEW)
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.ACTIVE_LISTING_LIMIT_REACHED,
      );
      expect(prisma.listing.create).not.toHaveBeenCalled();
    });

    it('allows the create when under the limit', async () => {
      prisma.userRole.count.mockResolvedValue(0);
      activeLimit.getLimit.mockResolvedValue(2);
      prisma.listing.count.mockResolvedValue(1); // 1 < 2
      prisma.listing.create.mockResolvedValue(dbListing);
      await expect(service.create(OWNER_ID, validCreate as any)).resolves.toBeDefined();
    });

    it('does not apply the limit to professionals (AGENT/AGENCY)', async () => {
      prisma.userRole.count.mockResolvedValue(1); // есть AGENT/AGENCY
      prisma.listing.count.mockResolvedValue(999);
      prisma.listing.create.mockResolvedValue(dbListing);
      await expect(service.create(OWNER_ID, validCreate as any)).resolves.toBeDefined();
      expect(activeLimit.getLimit).not.toHaveBeenCalled(); // ранний выход
    });

    it('treats limit 0 as unlimited', async () => {
      prisma.userRole.count.mockResolvedValue(0);
      activeLimit.getLimit.mockResolvedValue(0);
      prisma.listing.create.mockResolvedValue(dbListing);
      await expect(service.create(OWNER_ID, validCreate as any)).resolves.toBeDefined();
      expect(prisma.listing.count).not.toHaveBeenCalled(); // до подсчёта не доходим
    });
  });

  describe('update', () => {
    it('updates own listing scalar fields and the author translation', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
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

    it('sends an edited ACTIVE listing back to moderation (NEW)', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        status: ListingStatus.ACTIVE,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);

      await service.update(OWNER_ID, LISTING_ID, {
        price: '5000000.00',
      } as any);

      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.status).toBe(ListingStatus.NEW);
    });

    it('does not change status when editing a non-ACTIVE listing', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        status: ListingStatus.DRAFT,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);

      await service.update(OWNER_ID, LISTING_ID, { rooms: 4 } as any);

      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.status).toBeUndefined();
    });

    it('does not touch translations when none provided', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);

      await service.update(OWNER_ID, LISTING_ID, { rooms: 3 } as any);

      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.translations).toBeUndefined();
      expect(data.rooms).toBe(3);
    });

    it('passes bathrooms through to Prisma on update', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);

      await service.update(OWNER_ID, LISTING_ID, { bathrooms: 3 } as any);

      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.bathrooms).toBe(3);
    });

    it('passes parking_type through to Prisma on update', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);

      await service.update(OWNER_ID, LISTING_ID, { parking_type: ParkingType.YARD } as any);

      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.parkingType).toBe(ParkingType.YARD);
    });

    it('passes lot_area through to Prisma on update', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);

      await service.update(OWNER_ID, LISTING_ID, { lot_area: '7.00' } as any);

      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.lotArea).toBe('7.00');
    });

    it('appends a price-history row when the price actually changes', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, { price: '4200000.00' } as any);
      expect(prisma.listingPriceHistory.create).toHaveBeenCalledWith({
        data: {
          listingId: LISTING_ID,
          price: '4200000.00',
          currency: Currency.UZS,
        },
      });
    });

    it('appends a price-history row when only the currency changes', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, { currency: Currency.USD } as any);
      expect(prisma.listingPriceHistory.create).toHaveBeenCalledWith({
        data: {
          listingId: LISTING_ID,
          price: '4500000.00',
          currency: Currency.USD,
        },
      });
    });

    it('does not append history when the submitted price equals the current one', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, { price: '4500000.00' } as any);
      expect(prisma.listingPriceHistory.create).not.toHaveBeenCalled();
    });

    it('does not append history when price/currency are not in the dto', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, { rooms: 3 } as any);
      expect(prisma.listingPriceHistory.create).not.toHaveBeenCalled();
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

  describe('address resolution (ADR-0147)', () => {
    beforeEach(() => {
      prisma.listing.create.mockResolvedValue(dbListing);
    });

    it('create с координатами: геокод успешен → address ru + addressEn', async () => {
      addressResolver.resolve.mockResolvedValue({
        address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
        addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1',
      });
      await service.create(OWNER_ID, {
        ...validCreate,
        address: 'город Ташкент, Чиланзар, улица Сеул, 7/1, Чиланзарский р-н',
        latitude: '41.299500',
        longitude: '69.240100',
        district_id: 'd1',
      } as any);
      expect(addressResolver.resolve).toHaveBeenCalledWith('41.299500', '69.240100', 'd1');
      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, Чиланзар, ул. Сеул, 7/1');
      expect(data.addressEn).toBe('Tashkent, Chilanzar, Seul koʻchasi, 7/1');
    });

    it('create: геокодер молчит → строковый фолбэк, addressEn null', async () => {
      await service.create(OWNER_ID, {
        ...validCreate,
        address: 'город Ташкент, Мирзо-Улугбек, ул. Бабура, 13, Мирзо-Улугбек р-н, Ташкент',
        latitude: '41.325000',
        longitude: '69.295000',
      } as any);
      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, Мирзо-Улугбек, ул. Бабура, 13');
      expect(data.addressEn).toBeNull();
    });

    it('create без координат: только нормализация, геокодер не зовётся', async () => {
      await service.create(OWNER_ID, {
        ...validCreate,
        address: 'Узбекистан, Ташкент, Юнусабад, массив Файзли, 18',
      } as any);
      expect(addressResolver.resolve).not.toHaveBeenCalled();
      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, Юнусабад, массив Файзли, 18');
    });

    it('update: новые координаты → ре-геокод с district_id из existing', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        status: ListingStatus.ACTIVE,
        toursEnabled: false,
        tourWindows: [],
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
        latitude: new Prisma.Decimal('41.2000'),
        longitude: new Prisma.Decimal('69.2000'),
        districtId: 'd-existing',
      });
      prisma.listing.update.mockResolvedValue(dbListing);
      addressResolver.resolve.mockResolvedValue({ address: 'Ташкент, ул. Новая, 1', addressEn: null });
      await service.update(OWNER_ID, LISTING_ID, {
        latitude: '41.311000',
        longitude: '69.280000',
      } as any);
      expect(addressResolver.resolve).toHaveBeenCalledWith('41.311000', '69.280000', 'd-existing');
      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, ул. Новая, 1');
      expect(data.addressEn).toBeNull();
    });

    it('update: правка только текста адреса → нормализация БЕЗ ре-геокода', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        status: ListingStatus.ACTIVE,
        toursEnabled: false,
        tourWindows: [],
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
        latitude: new Prisma.Decimal('41.2000'),
        longitude: new Prisma.Decimal('69.2000'),
        districtId: 'd-existing',
      });
      prisma.listing.update.mockResolvedValue(dbListing);
      await service.update(OWNER_ID, LISTING_ID, {
        address: 'город Ташкент, свой дом у парка',
      } as any);
      expect(addressResolver.resolve).not.toHaveBeenCalled();
      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.address).toBe('Ташкент, свой дом у парка');
      expect(data.addressEn).toBeNull();
    });
  });

  describe('findOne', () => {
    const detailRow = {
      id: LISTING_ID,
      reference: 100042,
      ownerId: OWNER_ID,
      agencyId: null,
      // Контакт автора (TASK-210): профиль + роль AGENT.
      owner: {
        phone: '+998901112233',
        profile: {
          displayName: 'Алишер',
          firstName: 'Алишер',
          lastName: 'Усманов',
          contactPhone: '+998905556677',
        },
        roles: [{ role: { code: 'AGENT' } }],
      },
      status: ListingStatus.ACTIVE,
      transactionType: TransactionType.RENT,
      propertyType: PropertyType.APARTMENT,
      originalLanguage: Language.RU,
      price: new Prisma.Decimal('4500000.00'),
      currency: Currency.UZS,
      area: new Prisma.Decimal('62.50'),
      livingArea: new Prisma.Decimal('95.00'),
      nonLivingArea: null,
      rooms: 2,
      floor: 4,
      isBasement: false,
      totalFloors: 9,
      yearBuilt: 2018,
      address: 'Yunusobod 12-23',
      cityId: 'c1',
      districtId: 'd1',
      latitude: new Prisma.Decimal('41.35'),
      longitude: new Prisma.Decimal('69.29'),
      amenities: [Amenity.ELEVATOR],
      promotionType: PromotionType.VIP,
      promotionExpiresAt: new Date('2026-06-20T00:00:00.000Z'),
      publishedAt: new Date('2026-06-01T10:00:00.000Z'),
      createdAt: new Date('2026-05-30T09:00:00.000Z'),
      viewsCount: 12,
      _count: { favorites: 3 },
      // История цены (ADR-0121): пустая по умолчанию, порядок проверяется отдельным тестом.
      priceHistory: [],
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
        reference: 100042,
        status: ListingStatus.ACTIVE,
        price: '4500000.00',
        area: '62.50',
        living_area: '95.00',
        non_living_area: null,
        is_basement: false,
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
        views_count: 12,
        likes_count: 3,
        // Контакт автора (TASK-210): displayName + contactPhone приоритетны,
        // роль AGENT → type=agent, is_pro=true.
        contact: {
          display_name: 'Алишер',
          type: 'agent',
          is_pro: true,
          phone: '+998905556677',
        },
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

    it('detail отдаёт amenities из БД', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        amenities: [Amenity.ELEVATOR, Amenity.INTERNET],
      });

      const result = await service.findOne(LISTING_ID, undefined);

      expect(result.amenities).toEqual([Amenity.ELEVATOR, Amenity.INTERNET]);
    });

    it('detail отдаёт пустой amenities если массив пуст', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        amenities: [],
      });

      const result = await service.findOne(LISTING_ID, undefined);

      expect(result.amenities).toEqual([]);
    });

    it('returns price_history in chronological order', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        priceHistory: [
          {
            price: new Prisma.Decimal('4500000.00'),
            currency: Currency.UZS,
            createdAt: new Date('2026-06-02T08:00:00.000Z'),
          },
          {
            price: new Prisma.Decimal('4200000.00'),
            currency: Currency.UZS,
            createdAt: new Date('2026-07-01T08:00:00.000Z'),
          },
        ],
      });

      const res = await service.findOne(LISTING_ID, undefined);

      expect(res.price_history).toEqual([
        {
          price: '4500000.00',
          currency: Currency.UZS,
          created_at: '2026-06-02T08:00:00.000Z',
        },
        {
          price: '4200000.00',
          currency: Currency.UZS,
          created_at: '2026-07-01T08:00:00.000Z',
        },
      ]);
    });

    // Адрес по языку в detail (ADR-0147, Task 9): аналогично search-выдаче
    // (Task 8) — при lang=en отдаём addressEn, если он заполнен; для других
    // языков (в т.ч. UZ, у которого нет своего address-поля) — канонический RU address.
    it('returns addressEn for lang=en, and the canonical RU address for other languages', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...detailRow,
        address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
        addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1',
        translations: [
          ...detailRow.translations,
          {
            language: Language.UZ,
            title: '2 xonali kvartira',
            description: 'Yorugʻ',
            addressNote: 'metro yaqinida',
            featuresText: 'balkon',
          },
        ],
      });

      const en = await service.findOne(LISTING_ID, undefined, 'en');
      expect(en.address).toBe('Tashkent, Chilanzar, Seul koʻchasi, 7/1');

      const uz = await service.findOne(LISTING_ID, undefined, 'uz');
      expect(uz.language).toBe(Language.UZ);
      expect(uz.address).toBe('Ташкент, Чиланзар, ул. Сеул, 7/1');
    });

    // findByReference (ADR-0137): поиск по короткому номеру повторяет видимость
    // findOne, отличается лишь ключом поиска (reference вместо UUID-id).
    it('finds an ACTIVE listing by its reference number', async () => {
      prisma.listing.findUnique.mockResolvedValue(detailRow);

      const result = await service.findByReference(100042, undefined);

      expect(prisma.listing.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { reference: 100042 } }),
      );
      expect(result).toMatchObject({ id: LISTING_ID, reference: 100042 });
    });

    it('throws 404 NOT_FOUND when no listing has that reference', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);

      await expectCode(
        service.findByReference(999999, undefined),
        ApiErrorCode.NOT_FOUND,
      );
    });
  });

  describe('amenities', () => {
    it('passes amenities through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        amenities: [Amenity.ELEVATOR, Amenity.INTERNET],
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.amenities).toEqual([Amenity.ELEVATOR, Amenity.INTERNET]);
    });

    it('passes amenities through to Prisma on update', async () => {
      prisma.listing.findFirst.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        originalLanguage: Language.RU,
        price: new Prisma.Decimal('4500000.00'),
        currency: Currency.UZS,
      });
      prisma.listing.update.mockResolvedValue(dbListing);

      await service.update(OWNER_ID, LISTING_ID, {
        amenities: [Amenity.FURNITURE, Amenity.HEATING],
      } as any);

      const data = prisma.listing.update.mock.calls[0][0].data;
      expect(data.amenities).toEqual([Amenity.FURNITURE, Amenity.HEATING]);
    });
  });

  describe('tours', () => {
    it('create сохраняет tours_enabled + tour_windows', async () => {
      // $transaction уже замокан в beforeEach (cb(prisma))
      prisma.userRole.count.mockResolvedValue(1);
      prisma.listing.create.mockResolvedValue({
        id: 'L1', status: ListingStatus.NEW, transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT, originalLanguage: Language.RU,
        price: new Prisma.Decimal('100.00'), currency: Currency.UZS,
        createdAt: new Date(),
      });
      await service.create('U1', {
        transaction_type: TransactionType.SALE, property_type: PropertyType.APARTMENT,
        original_language: Language.RU, price: '100.00', currency: Currency.UZS,
        tours_enabled: true, tour_windows: [{ start: '07:00', end: '10:00' }],
        translation: { title: 'T' },
      } as any);
      const arg = prisma.listing.create.mock.calls[0][0];
      expect(arg.data.toursEnabled).toBe(true);
      expect(arg.data.tourWindows).toEqual([{ start: '07:00', end: '10:00' }]);
    });

    it('create с tours_enabled и без окон → 422', async () => {
      await expect(
        service.create('U1', {
          transaction_type: TransactionType.SALE, property_type: PropertyType.APARTMENT,
          original_language: Language.RU, price: '100.00', currency: Currency.UZS,
          tours_enabled: true, tour_windows: [],
          translation: { title: 'T' },
        } as any),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('findMine', () => {
    const listRow = {
      id: LISTING_ID,
      status: ListingStatus.NEW,
      transactionType: TransactionType.RENT,
      propertyType: PropertyType.APARTMENT,
      originalLanguage: Language.RU,
      price: new Prisma.Decimal('4500000.00'),
      currency: Currency.UZS,
      area: new Prisma.Decimal('62.50'),
      rooms: 2,
      isBasement: false,
      cityId: 'c1',
      districtId: 'd1',
      address: 'Ташкент, Яшнабадский район, массив Городок',
      promotionType: PromotionType.NORMAL,
      promotionExpiresAt: null,
      publishedAt: null,
      createdAt: new Date('2026-06-03T09:00:00.000Z'),
      viewsCount: 0,
      _count: { favorites: 0 },
      translations: [
        { language: Language.RU, title: '2-комн квартира' },
        { language: Language.EN, title: '2-room apartment' },
      ],
      media: [
        {
          url: 'https://cdn.avino.uz/l1/1.webp',
          thumbnailUrl: 'https://cdn.avino.uz/l1/1_thumb.webp',
        },
      ],
    };

    it('returns the owner listings as a paginated snake_case envelope with defaults', async () => {
      prisma.listing.findMany.mockResolvedValue([listRow]);
      prisma.listing.count.mockResolvedValue(1);

      const result = await service.findMine(OWNER_ID, {});

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: OWNER_ID, status: { not: ListingStatus.DELETED } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 20,
        }),
      );
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(result.data[0]).toEqual({
        id: LISTING_ID,
        status: ListingStatus.NEW,
        transaction_type: TransactionType.RENT,
        property_type: PropertyType.APARTMENT,
        price: '4500000.00',
        currency: Currency.UZS,
        area: '62.50',
        lot_area: null,
        rooms: 2,
        bathrooms: null,
        is_basement: false,
        city_id: 'c1',
        district_id: 'd1',
        address: 'Ташкент, Яшнабадский район, массив Городок',
        promotion_type: PromotionType.NORMAL,
        promotion_expires_at: null,
        original_language: Language.RU,
        // title берётся на original_language (RU), не первый перевод.
        title: '2-комн квартира',
        thumbnail_url: 'https://cdn.avino.uz/l1/1_thumb.webp',
        published_at: null,
        created_at: '2026-06-03T09:00:00.000Z',
        views_count: 0,
        likes_count: 0,
      });
    });

    it('applies the status filter and page-based skip/take', async () => {
      prisma.listing.findMany.mockResolvedValue([]);
      prisma.listing.count.mockResolvedValue(40);

      const result = await service.findMine(OWNER_ID, {
        status: ListingStatus.ACTIVE,
        page: 2,
        limit: 15,
      });

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: OWNER_ID, status: ListingStatus.ACTIVE },
          skip: 15,
          take: 15,
        }),
      );
      expect(result.meta).toEqual({ page: 2, limit: 15, total: 40 });
    });

    it('never exposes DELETED listings even when explicitly filtered', async () => {
      prisma.listing.findMany.mockResolvedValue([]);
      prisma.listing.count.mockResolvedValue(0);

      await service.findMine(OWNER_ID, { status: ListingStatus.DELETED });

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: OWNER_ID, status: { not: ListingStatus.DELETED } },
        }),
      );
    });

    it('caps limit at 100', async () => {
      prisma.listing.findMany.mockResolvedValue([]);
      prisma.listing.count.mockResolvedValue(0);

      const result = await service.findMine(OWNER_ID, { limit: 500 });

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
      expect(result.meta.limit).toBe(100);
    });

    it('falls back to the first translation title when original_language is missing', async () => {
      prisma.listing.findMany.mockResolvedValue([
        {
          ...listRow,
          originalLanguage: Language.UZ,
          translations: [{ language: Language.EN, title: 'Only EN' }],
          media: [],
        },
      ]);
      prisma.listing.count.mockResolvedValue(1);

      const result = await service.findMine(OWNER_ID, {});

      expect(result.data[0].title).toBe('Only EN');
      expect(result.data[0].thumbnail_url).toBeNull();
    });
  });

  describe('registerView', () => {
    it('инкрементит views_count raw-UPDATE, резолвится без ошибки', async () => {
      prisma.$executeRaw.mockResolvedValue(1);

      await expect(service.registerView(LISTING_ID)).resolves.toBeUndefined();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('404 когда листинг не найден или не ACTIVE', async () => {
      prisma.$executeRaw.mockResolvedValue(0);

      await expectCode(service.registerView(LISTING_ID), ApiErrorCode.NOT_FOUND);
    });
  });

  describe('registerCall', () => {
    it('инкрементит calls_count raw-UPDATE, резолвится без ошибки', async () => {
      prisma.$executeRaw.mockResolvedValue(1);

      await expect(service.registerCall(LISTING_ID)).resolves.toBeUndefined();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('404 когда листинг не найден или не ACTIVE', async () => {
      prisma.$executeRaw.mockResolvedValue(0);

      await expectCode(service.registerCall(LISTING_ID), ApiErrorCode.NOT_FOUND);
    });
  });
});
