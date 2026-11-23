import {
  Currency,
  Language,
  ListingStatus,
  ModerationAction,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { AddressResolverService, DistrictsService } from '../geo';
import { ModerationService } from '../moderation/moderation.service';
import { PrismaService } from '../prisma';
import { ActiveListingLimitService } from '../settings';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { ListingsService } from './listings.service';

// Медиа-подпись здесь не тестируется (ADR-0086) — echo сохранённого url, без S3.
const uploadsStub = {
  resolveMediaUrl: async (_key: string | null | undefined, url: string) => url,
  getObjectUrl: async (key: string) => key,
} as unknown as UploadsService;
const activeLimitStub = { getLimit: async () => 0 } as unknown as ActiveListingLimitService;
const addressResolverStub = { resolve: async () => null } as unknown as AddressResolverService;

/**
 * SEO AUD-9 на живом PostgreSQL: пока правка опубликованного объявления на
 * модерации, посетитель видит одобренную версию; одобрение показывает правку;
 * отклонение оставляет одобренную. Триггер снимает копию при любом переходе
 * вне NEW/REJECTED — и из кода, и из raw SQL.
 *
 * Изоляция — уникальный `city_id`; данные удаляются в `afterAll`.
 */
describe('published version during re-moderation (integration, SEO AUD-9)', () => {
  const prisma = new PrismaService();
  const listings = new ListingsService(
    prisma,
    new TranslationsService(prisma),
    new DistrictsService(prisma),
    uploadsStub,
    activeLimitStub,
    addressResolverStub,
  );
  const moderation = new ModerationService(prisma, uploadsStub);

  const CITY_ID = '55555555-3333-4444-8555-000000000909';
  const LISTING_ID = 'a9000000-0000-4000-8000-000000000909';
  const SQL_LISTING_ID = 'a9000000-0000-4000-8000-000000000910';
  const OWNER_PHONE = '+998900000909';
  let ownerId: string;
  let moderatorId: string;

  const owner = () => ({ id: ownerId, roles: [] });

  async function createActive(id: string): Promise<void> {
    await prisma.listing.create({
      data: {
        id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        publishedAt: new Date('2026-06-01T10:00:00.000Z'),
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID,
        translations: {
          create: [Language.RU, Language.UZ, Language.EN].map((language) => ({
            language,
            title: `Одобрено ${language}`,
            source: TranslationSource.USER,
          })),
        },
        media: {
          create: [{ url: 'approved.webp', sortOrder: 0 }],
        },
      },
    });
  }

  const versionOf = (id: string) =>
    prisma.listingPublishedVersion.findUnique({ where: { listingId: id } });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    await prisma.user.deleteMany({ where: { phone: { in: [OWNER_PHONE, '+998900000910'] } } });
    ownerId = (await prisma.user.create({ data: { phone: OWNER_PHONE } })).id;
    moderatorId = (await prisma.user.create({ data: { phone: '+998900000910' } })).id;
    await createActive(LISTING_ID);
    await createActive(SQL_LISTING_ID);
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, moderatorId] } } });
    await prisma.$disconnect();
  });

  it('owner edit of an ACTIVE listing: back to NEW, guests still see the approved version', async () => {
    await listings.update(ownerId, LISTING_ID, {
      price: '200000.00',
      translation: { title: 'Правка на проверке' },
    } as any);

    const row = await prisma.listing.findUnique({ where: { id: LISTING_ID } });
    expect(row?.status).toBe(ListingStatus.NEW);
    expect(await versionOf(LISTING_ID)).not.toBeNull();

    const guest = await listings.findOne(LISTING_ID, undefined, 'ru');
    expect(guest.status).toBe(ListingStatus.ACTIVE);
    expect(guest.title).toBe('Одобрено RU');
    expect(guest.price).toBe('100000.00');
    expect(guest.media.map((m) => m.url)).toEqual(['approved.webp']);
    // Новая цена ещё не одобрена — в истории её нет.
    expect(guest.price_history.map((h) => h.price)).not.toContain('200000.00');

    const self = await listings.findOne(LISTING_ID, owner(), 'ru');
    expect(self.status).toBe(ListingStatus.NEW);
    expect(self.title).toBe('Правка на проверке');
  });

  it('REJECT of the edit keeps the approved version public', async () => {
    await moderation.changeStatus(moderatorId, LISTING_ID, {
      action: ModerationAction.REJECT,
      reason: 'test',
    } as any);

    expect(await versionOf(LISTING_ID)).not.toBeNull();
    const guest = await listings.findOne(LISTING_ID, undefined, 'ru');
    expect(guest.status).toBe(ListingStatus.ACTIVE);
    expect(guest.title).toBe('Одобрено RU');
  });

  it('a fixed edit of a REJECTED listing keeps the copy of the last APPROVED version', async () => {
    await listings.update(ownerId, LISTING_ID, { price: '150000.00' } as any);

    const row = await prisma.listing.findUnique({ where: { id: LISTING_ID } });
    expect(row?.status).toBe(ListingStatus.NEW);
    const guest = await listings.findOne(LISTING_ID, undefined, 'ru');
    expect(guest.price).toBe('100000.00');
    expect(guest.title).toBe('Одобрено RU');
  });

  it('APPROVE publishes the edit and drops the copy (trigger)', async () => {
    await moderation.changeStatus(moderatorId, LISTING_ID, {
      action: ModerationAction.APPROVE,
    } as any);

    expect(await versionOf(LISTING_ID)).toBeNull();
    const guest = await listings.findOne(LISTING_ID, undefined, 'ru');
    expect(guest.status).toBe(ListingStatus.ACTIVE);
    expect(guest.title).toBe('Правка на проверке');
    expect(guest.price).toBe('150000.00');
    // published_at первой публикации не сброшен.
    expect(guest.published_at).toBe('2026-06-01T10:00:00.000Z');
  });

  it('a status change outside NEW/REJECTED from raw SQL drops the copy too', async () => {
    await listings.update(ownerId, SQL_LISTING_ID, { price: '300000.00' } as any);
    expect(await versionOf(SQL_LISTING_ID)).not.toBeNull();

    // NEW → REJECTED: копия нужна (одобренная версия остаётся публичной).
    await prisma.$executeRaw`UPDATE listings SET status = 'REJECTED' WHERE id = ${SQL_LISTING_ID}::uuid`;
    expect(await versionOf(SQL_LISTING_ID)).not.toBeNull();

    // Скрытие (как блокировка автора в admin-users) — копия снимается.
    await prisma.$executeRaw`UPDATE listings SET status = 'ARCHIVED' WHERE id = ${SQL_LISTING_ID}::uuid`;
    expect(await versionOf(SQL_LISTING_ID)).toBeNull();
    await expect(listings.findOne(SQL_LISTING_ID, undefined)).rejects.toMatchObject({ status: 404 });
  });
});
