import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  Currency,
  Language,
  ListingStatus,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { AppConfigModule } from '../config';
import { AddressResolverService, DistrictsService } from '../geo';
import { PrismaModule, PrismaService } from '../prisma';
import { ACTIVE_LISTING_LIMIT_KEY, ActiveListingLimitService } from '../settings';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { ListingsModule } from './listings.module';
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
 *   - владелец с профилем + ролью AGENT → display_name/contactPhone, type=agent,
 *     is_pro=true (телефон — contact_phone профиля);
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

  it('embeds an agent contact: display name, type=agent, is_pro, contact phone', async () => {
    const detail = await listings.findOne(AGENT_LISTING, undefined, 'ru');
    expect(detail.contact).toEqual({
      display_name: 'Иван Агент',
      type: 'agent',
      is_pro: true,
      phone: '+998901230099', // contact_phone профиля приоритетен
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
 * Integration-тест проактивного agent-gate `GET /listings/quota`
 * (.superpowers/sdd/task-2-brief.md): роут оборачивает
 * {@link ListingsService.getActiveListingQuota} Bearer-эндпоинтом. Тест
 * работает на HTTP-уровне (проверяет guard + путь, а не только сервис),
 * поэтому поднимает Nest-приложение из `AppConfigModule` + `ListingsModule`
 * (не весь `AppModule` — Redis/очереди/realtime этому роуту не нужны) и бьёт
 * по нему нативным `fetch` (Node ≥ 20, как {@link YandexTranslationProvider}):
 * `supertest` в зависимостях `@avino/api` нет, а добавлять новую зависимость
 * вне рамок задачи нельзя.
 */
describe('GET /listings/quota (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let jwt: JwtService;
  let accessSecret: string;

  let userId: string;
  let previousLimitValue: string | null;

  const CITY_ID = '77777777-3333-4444-8555-000000000230';

  function signToken(sub: string): Promise<string> {
    return jwt.signAsync({ sub, roles: [] }, { secret: accessSecret });
  }

  async function createActiveListing(
    id: string,
    ownerId: string,
  ): Promise<void> {
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
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, ListingsModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    accessSecret = app.get(ConfigService).get<string>('jwt.accessSecret')!;

    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    const user = await prisma.user.create({ data: { phone: '+998901230230' } });
    userId = user.id;

    // Запомнить лимит, который уже был в БД, чтобы восстановить его в afterAll
    // и не оставлять состояние изменённым для соседних прогонов.
    const existing = await prisma.appSetting.findUnique({
      where: { key: ACTIVE_LISTING_LIMIT_KEY },
    });
    previousLimitValue = existing?.value ?? null;
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    if (previousLimitValue === null) {
      await prisma.appSetting
        .delete({ where: { key: ACTIVE_LISTING_LIMIT_KEY } })
        .catch(() => undefined);
    } else {
      await prisma.appSetting.update({
        where: { key: ACTIVE_LISTING_LIMIT_KEY },
        data: { value: previousLimitValue },
      });
    }
    await app.close();
  });

  it('обычный пользователь без объявлений → blocked=false', async () => {
    const token = await signToken(userId);
    const res = await fetch(`${baseUrl}/api/v1/listings/quota`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ used: 0, blocked: false });
    expect(typeof body.limit).toBe('number');
  });

  it('пользователь на лимите → blocked=true', async () => {
    await prisma.appSetting.upsert({
      where: { key: ACTIVE_LISTING_LIMIT_KEY },
      update: { value: '1' },
      create: { key: ACTIVE_LISTING_LIMIT_KEY, value: '1' },
    });
    await createActiveListing('c3333333-0000-4000-8000-000000000230', userId);

    const token = await signToken(userId);
    const res = await fetch(`${baseUrl}/api/v1/listings/quota`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(true);
    expect(body.used).toBeGreaterThanOrEqual(body.limit);
  });

  it('без Bearer → 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/listings/quota`);
    expect(res.status).toBe(401);
  });
});
