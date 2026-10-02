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
import { Workbook } from 'exceljs';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { EXPORT_MAX_ROWS } from './listing-export.builder';
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
  const MOD_ID = MODERATOR_ID;
  const OWNER_ID = 'owner-1';
  const LISTING_ID = '11111111-1111-1111-1111-111111111111';

  let prisma: any;
  let uploads: any;
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
    districtId: 'district-1',
    rooms: 2,
    viewsCount: 7,
    publishedAt: null,
    createdAt: new Date('2026-06-02T08:00:00.000Z'),
    translations: [{ language: Language.RU, title: '2-комн квартира' }],
    media: [
      {
        url: 'https://r2/listings/x/orig.jpg',
        storageKey: 'listings/x/orig.jpg',
        thumbnailUrl: 'https://r2/listings/x/thumb.jpg',
      },
    ],
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
        // ADR-0151: contact_phone инлайн-профиля показывается только verified.
        contactPhoneVerified: true,
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
      // Батч имён районов для district_name (relation в схеме нет).
      district: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
      notification: { create: jest.fn() },
      listingTranslation: { findMany: jest.fn() },
      // Интерактивная транзакция: коллбэк получает тот же мок (tx === prisma).
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
      // Raw-поиск кандидатов-дубликатов (нормализация адреса в SQL).
      $queryRaw: jest.fn(),
    };
    // UploadsService: sign-on-read обложки. Возвращаем стабильный URL, чтобы
    // отличать «есть фото» от null без обращения к S3.
    uploads = {
      resolveMediaUrl: jest
        .fn()
        .mockResolvedValue('https://signed.example/cover.jpg'),
    };
    service = new ModerationService(prisma, uploads);
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

  describe('getListingOwner', () => {
    it('returns the inline owner profile for an existing listing', async () => {
      prisma.listing.findUnique.mockResolvedValue({ owner: dbListItem.owner });

      const owner = await service.getListingOwner(LISTING_ID);

      expect(prisma.listing.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LISTING_ID } }),
      );
      expect(owner).toEqual({
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

    it('throws NOT_FOUND when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectCode(
        service.getListingOwner(LISTING_ID),
        ApiErrorCode.NOT_FOUND,
      );
    });

    // ADR-0151: неподтверждённый contact_phone не отдаётся модератору (null),
    // в отличие от detail/tour/agent-application фолбэков — тут нет отдельного
    // поля для телефона аккаунта, поэтому дублировать его в contact_phone не надо.
    it('hides an unverified contact_phone (null, no fallback to account phone)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        owner: {
          ...dbListItem.owner,
          profile: { ...dbListItem.owner.profile, contactPhoneVerified: false },
        },
      });

      const owner = await service.getListingOwner(LISTING_ID);

      expect(owner.contact_phone).toBeNull();
    });
  });

  describe('exportListings', () => {
    const dbExportItem = {
      reference: 100042,
      status: ListingStatus.NEW,
      transactionType: TransactionType.RENT,
      propertyType: PropertyType.APARTMENT,
      originalLanguage: Language.RU,
      price: new Prisma.Decimal('4500000.00'),
      currency: Currency.UZS,
      districtId: 'district-1',
      address: 'Ташкент, ул. Навои, 12',
      rooms: 2,
      area: new Prisma.Decimal('55.50'),
      lotArea: null,
      viewsCount: 7,
      publishedAt: null,
      createdAt: new Date('2026-06-02T08:00:00.000Z'),
      translations: [
        { language: Language.UZ, title: '2 xonali kvartira' },
        { language: Language.RU, title: '2-комн квартира' },
      ],
      owner: {
        email: 'seller@example.com',
        phone: '+998901234567',
        profile: {
          firstName: 'Алишер',
          lastName: 'Усманов',
          displayName: null,
          contactPhone: '+998907654321',
          contactPhoneVerified: true,
        },
      },
    };

    async function sheetOf(buffer: Buffer) {
      const workbook = new Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      return workbook.worksheets[0];
    }

    it('applies the list filters without pagination, capped at EXPORT_MAX_ROWS', async () => {
      prisma.listing.findMany.mockResolvedValue([]);

      await service.exportListings({
        status: ListingStatus.ACTIVE,
        transaction_type: TransactionType.SALE,
        q: 'квартира',
        page: 3,
        limit: 10,
      });

      const args = prisma.listing.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        status: ListingStatus.ACTIVE,
        transactionType: TransactionType.SALE,
        translations: {
          some: { title: { contains: 'квартира', mode: 'insensitive' } },
        },
      });
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(args.take).toBe(EXPORT_MAX_ROWS);
      expect(args.skip).toBeUndefined();
      expect(prisma.listing.count).not.toHaveBeenCalled();
    });

    it('writes one row per listing: original-language title, district and owner', async () => {
      prisma.listing.findMany.mockResolvedValue([dbExportItem]);
      prisma.district.findMany.mockResolvedValue([
        { id: 'district-1', nameRu: 'Чиланзарский район' },
      ]);

      const sheet = await sheetOf(await service.exportListings({}));

      expect(sheet.rowCount).toBe(2);
      const row = sheet.getRow(2);
      expect(row.getCell(1).value).toBe(100042);
      expect(row.getCell(2).value).toBe('2-комн квартира');
      expect(row.getCell(6).value).toBe(4500000);
      expect(row.getCell(9).value).toBe(55.5);
      expect(row.getCell(10).value).toBe('Чиланзарский район');
      // display_name пуст → имя + фамилия.
      expect(row.getCell(11).value).toBe('Алишер Усманов');
      expect(row.getCell(12).value).toBe('+998901234567');
    });

    it('does not select media or sign cover URLs', async () => {
      prisma.listing.findMany.mockResolvedValue([dbExportItem]);

      await service.exportListings({});

      expect(prisma.listing.findMany.mock.calls[0][0].select.media).toBeUndefined();
      expect(uploads.resolveMediaUrl).not.toHaveBeenCalled();
    });

    it('falls back to the verified contact phone and to the lot area', async () => {
      const owner = { ...dbExportItem.owner, phone: null };
      prisma.listing.findMany.mockResolvedValue([
        { ...dbExportItem, owner, area: null, lotArea: new Prisma.Decimal('600.00') },
        {
          ...dbExportItem,
          owner: { ...owner, profile: { ...owner.profile, contactPhoneVerified: false } },
        },
      ]);

      const sheet = await sheetOf(await service.exportListings({}));

      expect(sheet.getRow(2).getCell(9).value).toBe(600);
      expect(sheet.getRow(2).getCell(12).value).toBe('+998907654321');
      // Неподтверждённый контактный телефон в файл не попадает (ADR-0151).
      expect(sheet.getRow(3).getCell(12).value).toBeNull();
    });

    it('leaves the author empty when the owner has no profile', async () => {
      prisma.listing.findMany.mockResolvedValue([
        { ...dbExportItem, owner: { ...dbExportItem.owner, profile: null } },
      ]);

      const sheet = await sheetOf(await service.exportListings({}));

      expect(sheet.getRow(2).getCell(11).value).toBeNull();
    });
  });

  describe('listListings', () => {
    it('returns a paginated snake_case list with owner_id and meta.total', async () => {
      prisma.listing.findMany.mockResolvedValue([dbListItem]);
      prisma.listing.count.mockResolvedValue(1);
      prisma.district.findMany.mockResolvedValue([
        { id: 'district-1', nameRu: 'Чиланзарский район' },
      ]);

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
        rooms: 2,
        views_count: 7,
        district_name: 'Чиланзарский район',
      });
      // Имена районов — одним запросом по districtId строк страницы.
      expect(prisma.district.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['district-1'] } },
        select: { id: true, nameRu: true },
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

    it('resolves a fresh cover URL from the first media (prefers thumbnail)', async () => {
      prisma.listing.findMany.mockResolvedValue([dbListItem]);
      prisma.listing.count.mockResolvedValue(1);

      const result = await service.listListings({ status: ListingStatus.NEW });

      // thumbnailUrl присутствует → sign-on-read из него (storageKey не нужен).
      expect(uploads.resolveMediaUrl).toHaveBeenCalledWith(
        null,
        'https://r2/listings/x/thumb.jpg',
      );
      expect(result.data[0].photo_url).toBe('https://signed.example/cover.jpg');
    });

    it('returns photo_url=null when the listing has no media', async () => {
      prisma.listing.findMany.mockResolvedValue([{ ...dbListItem, media: [] }]);
      prisma.listing.count.mockResolvedValue(1);

      const result = await service.listListings({ status: ListingStatus.NEW });

      expect(result.data[0].photo_url).toBeNull();
      expect(uploads.resolveMediaUrl).not.toHaveBeenCalled();
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
      prisma.listingTranslation.findMany.mockResolvedValue([
        { language: Language.RU },
        { language: Language.EN },
        { language: Language.UZ },
      ]);
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
    });

    it('keeps the existing published_at when re-approving a DRAFT listing', async () => {
      const firstPublished = new Date('2026-06-01T00:00:00.000Z');
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.DRAFT,
        publishedAt: firstPublished,
      });
      prisma.listingTranslation.findMany.mockResolvedValue([
        { language: Language.RU },
        { language: Language.EN },
        { language: Language.UZ },
      ]);
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
    });

    it('ARCHIVE moves an ACTIVE listing to ARCHIVED, keeps published_at and logs it', async () => {
      const firstPublished = new Date('2026-05-01T00:00:00.000Z');
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.ACTIVE,
        publishedAt: firstPublished,
      });
      prisma.listing.update.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.ARCHIVED,
        publishedAt: firstPublished,
      });

      const result = await service.changeStatus(MODERATOR_ID, LISTING_ID, {
        action: ModerationAction.ARCHIVE,
      });

      // Из ACTIVE: контент уже прошёл модерацию → владелец может вернуть сразу
      // в ACTIVE (edited_since_hidden = false, как при владельческом HIDE).
      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: LISTING_ID },
        data: {
          status: ListingStatus.ARCHIVED,
          publishedAt: firstPublished,
          editedSinceHidden: false,
        },
        select: { id: true, status: true, publishedAt: true },
      });
      expect(prisma.moderationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: ModerationAction.ARCHIVE,
          oldStatus: ListingStatus.ACTIVE,
          newStatus: ListingStatus.ARCHIVED,
        }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      // Гейт переводов — только для APPROVE.
      expect(prisma.listingTranslation.findMany).not.toHaveBeenCalled();
      expect(result.status).toBe(ListingStatus.ARCHIVED);
    });

    it('ARCHIVE from a not-yet-approved status forces re-moderation on return', async () => {
      // Листинг уже публиковался, но после правки владельца висит в NEW:
      // возврат из архива не должен обойти очередь модерации.
      const firstPublished = new Date('2026-05-01T00:00:00.000Z');
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.NEW,
        publishedAt: firstPublished,
      });
      prisma.listing.update.mockResolvedValue({
        id: LISTING_ID,
        status: ListingStatus.ARCHIVED,
        publishedAt: firstPublished,
      });

      await service.changeStatus(MODERATOR_ID, LISTING_ID, {
        action: ModerationAction.ARCHIVE,
      });

      const updateArg = prisma.listing.update.mock.calls[0][0];
      expect(updateArg.data.editedSinceHidden).toBe(true);
    });

    it('throws 422 when archiving an already ARCHIVED listing', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID,
        ownerId: OWNER_ID,
        status: ListingStatus.ARCHIVED,
        publishedAt: new Date(),
      });
      await expectCode(
        service.changeStatus(MODERATOR_ID, LISTING_ID, {
          action: ModerationAction.ARCHIVE,
        }),
        ApiErrorCode.INVALID_STATUS_TRANSITION,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects APPROVE when a language translation is missing (422)', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID, ownerId: OWNER_ID, status: 'NEW', publishedAt: null,
      });
      prisma.listingTranslation.findMany.mockResolvedValue([
        { language: Language.RU }, { language: Language.EN }, // UZ missing
      ]);

      await expect(
        service.changeStatus(MOD_ID, LISTING_ID, { action: 'APPROVE' } as any),
      ).rejects.toMatchObject({ status: 422 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows APPROVE when all languages are present', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        id: LISTING_ID, ownerId: OWNER_ID, status: 'NEW', publishedAt: null,
      });
      prisma.listingTranslation.findMany.mockResolvedValue([
        { language: Language.RU }, { language: Language.EN }, { language: Language.UZ },
      ]);
      prisma.$transaction.mockImplementation(async (cb: any) =>
        cb({
          listing: { update: jest.fn().mockResolvedValue({ id: LISTING_ID, status: 'ACTIVE', publishedAt: new Date() }) },
          moderationLog: { create: jest.fn() },
          auditLog: { create: jest.fn() },
          notification: { create: jest.fn() },
        }),
      );

      const res = await service.changeStatus(MOD_ID, LISTING_ID, { action: 'APPROVE' } as any);
      expect(res.status).toBe('ACTIVE');
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

  describe('findDuplicates', () => {
    const sourceListing = {
      id: LISTING_ID,
      status: ListingStatus.NEW,
      price: new Prisma.Decimal('4500000.00'),
      area: new Prisma.Decimal('65.50'),
      totalFloors: 9,
      address: 'Ташкент, ул. Шота Руставели, 12',
    };

    const DUP_ID = '22222222-2222-2222-2222-222222222222';

    const dbDuplicate = {
      id: DUP_ID,
      reference: 100123,
      status: ListingStatus.ACTIVE,
      transactionType: TransactionType.RENT,
      price: new Prisma.Decimal('4500000.00'),
      currency: Currency.UZS,
      area: new Prisma.Decimal('65.50'),
      totalFloors: 9,
      address: 'Ташкент, ул. Шота Руставели, 12',
      originalLanguage: Language.RU,
      createdAt: new Date('2026-05-01T09:00:00.000Z'),
      translations: [{ language: Language.RU, title: '2-комн квартира' }],
      media: [
        {
          url: 'https://r2/listings/d/orig.jpg',
          storageKey: 'listings/d/orig.jpg',
          thumbnailUrl: null,
        },
      ],
    };

    it('returns duplicate cards in snake_case for matching listings', async () => {
      prisma.listing.findUnique.mockResolvedValue(sourceListing);
      prisma.$queryRaw.mockResolvedValue([{ id: DUP_ID }]);
      prisma.listing.findMany.mockResolvedValue([dbDuplicate]);

      const result = await service.findDuplicates(LISTING_ID);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [DUP_ID] } } }),
      );
      expect(result).toEqual([
        {
          id: DUP_ID,
          reference: 100123,
          status: ListingStatus.ACTIVE,
          transaction_type: TransactionType.RENT,
          price: '4500000.00',
          currency: Currency.UZS,
          area: '65.50',
          total_floors: 9,
          address: 'Ташкент, ул. Шота Руставели, 12',
          title: '2-комн квартира',
          photo_url: 'https://signed.example/cover.jpg',
          created_at: '2026-05-01T09:00:00.000Z',
        },
      ]);
    });

    it('preserves the candidate order returned by the raw query', async () => {
      const DUP_ID_2 = '33333333-3333-3333-3333-333333333333';
      prisma.listing.findUnique.mockResolvedValue(sourceListing);
      prisma.$queryRaw.mockResolvedValue([{ id: DUP_ID_2 }, { id: DUP_ID }]);
      // findMany отдаёт строки в «своём» порядке — сервис обязан пересортировать.
      prisma.listing.findMany.mockResolvedValue([
        dbDuplicate,
        { ...dbDuplicate, id: DUP_ID_2, reference: 100456 },
      ]);

      const result = await service.findDuplicates(LISTING_ID);

      expect(result.map((d) => d.id)).toEqual([DUP_ID_2, DUP_ID]);
    });

    it('returns [] without querying when the source listing has no address', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...sourceListing,
        address: null,
      });

      const result = await service.findDuplicates(LISTING_ID);

      expect(result).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns [] when no candidates match (no card query)', async () => {
      prisma.listing.findUnique.mockResolvedValue(sourceListing);
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.findDuplicates(LISTING_ID);

      expect(result).toEqual([]);
      expect(prisma.listing.findMany).not.toHaveBeenCalled();
    });

    it('throws 404 when the listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);
      await expectCode(
        service.findDuplicates(LISTING_ID),
        ApiErrorCode.NOT_FOUND,
      );
    });

    it('throws 404 when the listing is DELETED', async () => {
      prisma.listing.findUnique.mockResolvedValue({
        ...sourceListing,
        status: ListingStatus.DELETED,
      });
      await expectCode(
        service.findDuplicates(LISTING_ID),
        ApiErrorCode.NOT_FOUND,
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
