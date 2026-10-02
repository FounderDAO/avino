import {
  Currency,
  Language,
  ListingStatus,
  ModerationAction,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';
import { ModerationService } from './moderation.service';

// Медиа-подпись здесь не тестируется (ADR-0086) — echo сохранённого url, без S3.
const uploadsStub = {
  resolveMediaUrl: async (_key: string | null | undefined, url: string) => url,
} as unknown as UploadsService;

/**
 * Integration-тесты `ModerationService.findDuplicates` на живом PostgreSQL:
 * юнит-тесты мокают `$queryRaw`, поэтому SQL-нормализация адреса (регистр,
 * схлопывание пробелов) и null-безопасные равенства (IS NOT DISTINCT FROM)
 * проверяются только здесь. Изоляция — уникальный `city_id`; данные удаляются
 * в `afterAll`.
 */
describe('ModerationService.findDuplicates (integration)', () => {
  const prisma = new PrismaService();
  const service = new ModerationService(prisma, uploadsStub);

  const CITY_ID = '55555555-3333-4444-8555-000000000777';
  const SOURCE_ID = 'd1111111-0000-4000-8000-000000000777';
  const DUP_ID = 'd2222222-0000-4000-8000-000000000777';
  const DIFF_PRICE_ID = 'd3333333-0000-4000-8000-000000000777';
  const REJECTED_ID = 'd4444444-0000-4000-8000-000000000777';
  const NULL_FLOORS_ID = 'd5555555-0000-4000-8000-000000000777';

  let ownerId: string;

  async function createListing(
    id: string,
    overrides: {
      status?: ListingStatus;
      price?: string;
      address?: string;
      totalFloors?: number | null;
    } = {},
  ): Promise<void> {
    await prisma.listing.create({
      data: {
        id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: overrides.status ?? ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: overrides.price ?? '120000.00',
        currency: Currency.UZS,
        area: '55.00',
        totalFloors:
          overrides.totalFloors === undefined ? 9 : overrides.totalFloors,
        address: overrides.address ?? 'г. Ташкент, ул. Навои, 10',
        cityId: CITY_ID,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `dup-${id.slice(0, 8)}`,
              source: TranslationSource.USER,
            },
          ],
        },
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });

    const owner = await prisma.user.create({
      data: { phone: '+998907770777' },
    });
    ownerId = owner.id;

    // Источник — на модерации (NEW); кандидаты с теми же цена/площадь/этажность.
    await createListing(SOURCE_ID, { status: ListingStatus.NEW });
    // Дубликат: адрес отличается регистром и лишними пробелами — должен найтись.
    await createListing(DUP_ID, {
      address: '  Г. ТАШКЕНТ,   ул. навои, 10 ',
    });
    // Та же квартира, но другая цена — не дубликат.
    await createListing(DIFF_PRICE_ID, { price: '999999.00' });
    // Совпадает всё, но статус REJECTED — не считается.
    await createListing(REJECTED_ID, { status: ListingStatus.REJECTED });
    // Этажность null против 9 у источника — IS NOT DISTINCT FROM не матчит.
    await createListing(NULL_FLOORS_ID, { totalFloors: null });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('finds a NEW/ACTIVE duplicate by price+area+floors and normalized address', async () => {
    const result = await service.findDuplicates(SOURCE_ID);

    expect(result.map((d) => d.id)).toEqual([DUP_ID]);
    expect(result[0]).toMatchObject({
      status: ListingStatus.ACTIVE,
      price: '120000.00',
      area: '55.00',
      total_floors: 9,
      title: `dup-${DUP_ID.slice(0, 8)}`,
    });
  });

  it('is symmetric: the ACTIVE duplicate also sees the NEW source', async () => {
    const result = await service.findDuplicates(DUP_ID);
    expect(result.map((d) => d.id)).toEqual([SOURCE_ID]);
  });
});

/**
 * Integration-тест модераторского ARCHIVE на живом PostgreSQL: юнит-тесты
 * мокают Prisma и не видят, есть ли значение `ARCHIVE` в enum
 * `ModerationAction` самой БД (миграция) — без него запись moderation_logs
 * падает, и «В архив» в админке не работает. Здесь проверяется весь путь:
 * статус листинга, лог, уведомление владельцу и выдача вкладки «Архив».
 */
describe('ModerationService.changeStatus ARCHIVE (integration)', () => {
  const prisma = new PrismaService();
  const service = new ModerationService(prisma, uploadsStub);

  const CITY_ID = '55555555-3333-4444-8555-000000000778';
  const ACTIVE_ID = 'a1111111-0000-4000-8000-000000000778';
  const NEW_ID = 'a2222222-0000-4000-8000-000000000778';
  const PUBLISHED_AT = new Date('2026-09-01T10:00:00.000Z');

  let ownerId: string;
  let moderatorId: string;

  async function createListing(id: string, status: ListingStatus): Promise<void> {
    await prisma.listing.create({
      data: {
        id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status,
        originalLanguage: Language.RU,
        price: '120000.00',
        currency: Currency.UZS,
        cityId: CITY_ID,
        publishedAt: PUBLISHED_AT,
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });

    ownerId = (await prisma.user.create({ data: { phone: '+998907770778' } })).id;
    moderatorId = (await prisma.user.create({ data: { phone: '+998907770779' } })).id;

    await createListing(ACTIVE_ID, ListingStatus.ACTIVE);
    await createListing(NEW_ID, ListingStatus.NEW);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [ACTIVE_ID, NEW_ID] } },
    });
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, moderatorId].filter(Boolean) } },
    });
    await prisma.$disconnect();
  });

  it('archives an ACTIVE listing: status, moderation log, owner notification', async () => {
    const result = await service.changeStatus(moderatorId, ACTIVE_ID, {
      action: ModerationAction.ARCHIVE,
    });

    expect(result).toEqual({
      id: ACTIVE_ID,
      status: ListingStatus.ARCHIVED,
      published_at: PUBLISHED_AT.toISOString(),
    });

    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: ACTIVE_ID },
      select: { status: true, editedSinceHidden: true },
    });
    expect(row).toEqual({
      status: ListingStatus.ARCHIVED,
      editedSinceHidden: false,
    });

    const logs = await service.findLogs(ACTIVE_ID);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: ModerationAction.ARCHIVE,
      old_status: ListingStatus.ACTIVE,
      new_status: ListingStatus.ARCHIVED,
      moderator_id: moderatorId,
    });

    const notifications = await prisma.notification.findMany({
      where: { userId: ownerId },
      select: { dataJson: true },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].dataJson).toMatchObject({
      listing_id: ACTIVE_ID,
      new_status: ListingStatus.ARCHIVED,
    });
  });

  it('archived listing shows up under the ARCHIVED filter of the admin list', async () => {
    const { data } = await service.listListings({
      status: ListingStatus.ARCHIVED,
      limit: 100,
    });
    expect(data.map((l) => l.id)).toContain(ACTIVE_ID);
  });

  it('archiving a NEW listing marks it for re-moderation on return', async () => {
    await service.changeStatus(moderatorId, NEW_ID, {
      action: ModerationAction.ARCHIVE,
    });
    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: NEW_ID },
      select: { status: true, editedSinceHidden: true },
    });
    expect(row).toEqual({
      status: ListingStatus.ARCHIVED,
      editedSinceHidden: true,
    });
  });

  it('rejects a second ARCHIVE with 422 (already archived)', async () => {
    await expect(
      service.changeStatus(moderatorId, ACTIVE_ID, {
        action: ModerationAction.ARCHIVE,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
