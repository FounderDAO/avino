import {
  Currency,
  Language,
  ListingStatus,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { AddressResolverService, DistrictsService } from '../geo';
import { PrismaService } from '../prisma';
import { ActiveListingLimitService } from '../settings';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { ListingsService } from './listings.service';

// Медиа-подпись здесь не тестируется (ADR-0086) — echo сохранённого url, без S3.
const uploadsStub = {
  resolveMediaUrl: async (_key: string | null | undefined, url: string) => url,
} as unknown as UploadsService;

// Лимит активных объявлений в integration-сидинге отключаем (0 = без лимита),
// чтобы не блокировать создание нескольких листингов одного владельца.
const activeLimitStub = {
  getLimit: async () => 0,
} as unknown as ActiveListingLimitService;

// Геокодер здесь не тестируется (ADR-0147) — null = недоступен, адрес идёт
// строковым фолбэком через normalizeAddress.
const addressResolverStub = {
  resolve: async () => null,
} as unknown as AddressResolverService;

/**
 * Integration-тесты контактного блока детальной (TASK-210, ADR-0069) на живом
 * PostgreSQL. Проверяет, что `GET /listings/:id` встраивает публичный контакт
 * автора:
 *   - владелец с профилем + ролью AGENT + ПОДТВЕРЖДЁННЫМ contact_phone → type=agent,
 *     is_pro=true (телефон — contact_phone профиля, ADR-0151: только verified);
 *   - владелец без профиля/ролей → display_name=null, type=owner, is_pro=false,
 *     телефон = телефон аккаунта.
 *
 * Изоляция — уникальный `city_id`; данные удаляются в `afterAll`.
 */
describe('ListingsService contact block (integration, TASK-210)', () => {
  const prisma = new PrismaService();
  const districts = new DistrictsService(prisma);
  const listings = new ListingsService(
    prisma,
    new TranslationsService(prisma),
    districts,
    uploadsStub,
    activeLimitStub,
    addressResolverStub,
  );

  const CITY_ID = '55555555-3333-4444-8555-000000000210';
  const AGENT_LISTING = 'c1111111-0000-4000-8000-000000000210';
  const PLAIN_LISTING = 'c2222222-0000-4000-8000-000000000210';

  let agentOwnerId: string;
  let plainOwnerId: string;

  async function createListing(id: string, ownerId: string): Promise<void> {
    await prisma.listing.create({
      data: {
        id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID,
        translations: {
          create: [
            {
              language: Language.RU,
              title: `c210-${id.slice(0, 8)}`,
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

    const agentRole = await prisma.role.upsert({
      where: { code: 'AGENT' },
      update: {},
      create: { code: 'AGENT' },
    });

    const agentOwner = await prisma.user.create({
      data: {
        phone: '+998901230001',
        profile: {
          create: {
            displayName: 'Иван Агент',
            firstName: 'Иван',
            lastName: 'Агентов',
            contactPhone: '+998901230099',
            // ADR-0151: непроверенный contact_phone не показывается — этот
            // int-spec проверяет verified-ветку, поэтому подтверждаем явно.
            contactPhoneVerified: true,
          },
        },
        roles: { create: [{ role: { connect: { id: agentRole.id } } }] },
      },
    });
    agentOwnerId = agentOwner.id;

    // Владелец без профиля и без ролей.
    const plainOwner = await prisma.user.create({
      data: { phone: '+998907770002' },
    });
    plainOwnerId = plainOwner.id;

    await createListing(AGENT_LISTING, agentOwnerId);
    await createListing(PLAIN_LISTING, plainOwnerId);
  });

  afterAll(async () => {
    // Листинги — раньше пользователей (owner FK ON DELETE RESTRICT); профиль/роли
    // каскадно удаляются вместе с пользователем.
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    if (agentOwnerId) {
      await prisma.user.delete({ where: { id: agentOwnerId } });
    }
    if (plainOwnerId) {
      await prisma.user.delete({ where: { id: plainOwnerId } });
    }
    await prisma.$disconnect();
  });

  it('embeds an agent contact: display name, type=agent, is_pro, verified contact phone', async () => {
    const detail = await listings.findOne(AGENT_LISTING, undefined, 'ru');
    expect(detail.contact).toEqual({
      display_name: 'Иван Агент',
      type: 'agent',
      is_pro: true,
      phone: '+998901230099', // verified contact_phone профиля приоритетен (ADR-0151)
    });
  });

  it('embeds a plain owner contact: null name, type=owner, account phone', async () => {
    const detail = await listings.findOne(PLAIN_LISTING, undefined, 'ru');
    expect(detail.contact).toEqual({
      display_name: null,
      type: 'owner',
      is_pro: false,
      phone: '+998907770002', // нет профиля → телефон аккаунта
    });
  });
});

/**
 * Integration-тест проактивного agent-gate `ListingsService.getActiveListingQuota`
 * (.superpowers/sdd/task-2-brief.md) на живом PostgreSQL. Сервис-уровень (без
 * HTTP/guard/config-модуля — как остальные int-spec'и репозитория, см.
 * agent-applications.int-spec.ts): метод использует только
 * `prisma.userRole.count`, `activeLimit.getLimit()` и `prisma.listing.count`,
 * поэтому конструируем `ListingsService` напрямую со стабами для
 * зависимостей, которых он не трогает.
 *
 * Изоляция — уникальный `city_id`; данные удаляются в `afterAll`. Лимит
 * задаётся стабом `activeLimit.getLimit`, а не через `app_settings` — не
 * трогаем общий ключ `ACTIVE_LISTING_LIMIT_KEY`, который может читаться
 * соседними прогонами.
 */
describe('ListingsService.getActiveListingQuota (integration)', () => {
  const prisma = new PrismaService();
  let limit = 2;
  const activeLimit = {
    getLimit: async () => limit,
  } as unknown as ActiveListingLimitService;
  const listings = new ListingsService(
    prisma,
    {} as unknown as TranslationsService,
    {} as unknown as DistrictsService,
    {} as unknown as UploadsService,
    activeLimit,
    {} as unknown as AddressResolverService,
  );

  const CITY_ID = '77777777-3333-4444-8555-000000000230';

  let plainUserId: string;
  let blockedUserId: string;
  let agentUserId: string;

  async function createActiveListing(
    id: string,
    ownerId: string,
    status: ListingStatus = ListingStatus.ACTIVE,
  ): Promise<void> {
    await prisma.listing.create({
      data: {
        id,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status,
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID,
        amenities: [],
        translations: {
          create: [
            {
              language: Language.RU,
              title: `c230-${id.slice(0, 8)}`,
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

    // Роль AGENT: idempotent upsert как в харнесе листингов/agent-applications
    // — переживает уже засиженную роль.
    const agentRole = await prisma.role.upsert({
      where: { code: 'AGENT' },
      update: {},
      create: { code: 'AGENT' },
    });

    const plainUser = await prisma.user.create({ data: { phone: '+998901230231' } });
    plainUserId = plainUser.id;

    const blockedUser = await prisma.user.create({ data: { phone: '+998901230232' } });
    blockedUserId = blockedUser.id;

    const agentUser = await prisma.user.create({
      data: {
        phone: '+998901230233',
        roles: { create: [{ role: { connect: { id: agentRole.id } } }] },
      },
    });
    agentUserId = agentUser.id;
  });

  afterAll(async () => {
    // Листинги — раньше пользователей (owner FK ON DELETE RESTRICT); user_roles
    // каскадно удаляются вместе с пользователем.
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    const userIds = [plainUserId, blockedUserId, agentUserId].filter(
      (id): id is string => Boolean(id),
    );
    for (const id of userIds) {
      await prisma.user.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it('обычный пользователь с used < limit → blocked=false', async () => {
    limit = 2;
    await createActiveListing('c3333333-0000-4000-8000-000000000231', plainUserId);

    const quota = await listings.getActiveListingQuota(plainUserId);
    expect(quota).toEqual({ limit: 2, used: 1, blocked: false });
  });

  it('обычный пользователь с used >= limit → blocked=true', async () => {
    limit = 2;
    await createActiveListing(
      'c3333333-0000-4000-8000-000000000234',
      blockedUserId,
      ListingStatus.ACTIVE,
    );
    await createActiveListing(
      'c3333333-0000-4000-8000-000000000235',
      blockedUserId,
      ListingStatus.NEW,
    );

    const quota = await listings.getActiveListingQuota(blockedUserId);
    expect(quota.blocked).toBe(true);
    expect(quota.used).toBeGreaterThanOrEqual(quota.limit);
  });

  it('пользователь с ролью AGENT → blocked=false, used=0, независимо от лимита', async () => {
    limit = 1;
    await createActiveListing('c3333333-0000-4000-8000-000000000236', agentUserId);
    await createActiveListing(
      'c3333333-0000-4000-8000-000000000237',
      agentUserId,
      ListingStatus.NEW,
    );

    const quota = await listings.getActiveListingQuota(agentUserId);
    expect(quota).toEqual({ limit: 0, used: 0, blocked: false });
  });

  it('limit=0 (без ограничения) для обычного пользователя → blocked=false', async () => {
    limit = 0;

    const quota = await listings.getActiveListingQuota(plainUserId);
    expect(quota).toEqual({ limit: 0, used: 0, blocked: false });
  });
});
