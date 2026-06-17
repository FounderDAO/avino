import {
  Currency,
  Language,
  ListingStatus,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { ListingsService } from '../listings/listings.service';
import { PrismaService } from '../prisma';
import { SearchService } from '../search/search.service';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { DistrictsService } from './districts.service';

// Медиа-подпись здесь не тестируется (ADR-0086) — echo сохранённого url, без S3.
const uploadsStub = {
  resolveMediaUrl: async (_key: string | null | undefined, url: string) => url,
} as unknown as UploadsService;

/**
 * Integration-тесты справочника районов и встраивания `district_name` (TASK-209,
 * ADR-0068) на живом PostgreSQL. Требует применённой миграции
 * `20260613130000_add_districts` (таблица + сид 12 районов Ташкента).
 *
 * Проверяет:
 *   - `listAll()` содержит сид-районы (по code) и тестовый район;
 *   - `pickName` выбирает столбец по языку (UZ/RU/EN), `undefined → null`;
 *   - `/search` отдаёт `district_name` на языке карточки для листинга с известным
 *     `district_id` и `null` для несовпадающего id;
 *   - `/listings/:id` отдаёт `district_name`.
 *
 * Изоляция — уникальный `city_id`; данные удаляются в `afterAll`.
 */
describe('DistrictsService + district_name (integration, TASK-209)', () => {
  const prisma = new PrismaService();
  const translations = new TranslationsService(prisma);
  const districts = new DistrictsService(prisma);
  const search = new SearchService(prisma, translations, districts, uploadsStub);
  const listings = new ListingsService(
    prisma,
    translations,
    districts,
    uploadsStub,
  );

  const CITY_ID = '44444444-3333-4444-8555-000000000209';
  const TEST_DISTRICT_ID = 'd9999999-0000-4000-8000-000000000209';
  // Валидный UUID, которого НЕТ в таблице districts → district_name должен быть null.
  const UNKNOWN_DISTRICT_ID = 'eeeeeeee-0000-4000-8000-000000000209';
  const LISTING_MATCH = 'c1111111-0000-4000-8000-000000000209';
  const LISTING_NOMATCH = 'c2222222-0000-4000-8000-000000000209';

  let ownerId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    await prisma.district.deleteMany({ where: { id: TEST_DISTRICT_ID } });

    const owner = await prisma.user.create({
      data: { phone: '+998900000209' },
    });
    ownerId = owner.id;

    await prisma.district.create({
      data: {
        id: TEST_DISTRICT_ID,
        code: 'test-tuman-209',
        nameUz: 'Test tuman',
        nameRu: 'Тест район',
        nameEn: 'Test district',
      },
    });

    // Листинг с известным district_id и переводами на все 3 языка — чтобы язык
    // карточки детерминированно резолвился под запрошенный lang.
    await prisma.listing.create({
      data: {
        id: LISTING_MATCH,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID,
        districtId: TEST_DISTRICT_ID,
        translations: {
          create: [
            { language: Language.RU, title: 'мэтч', source: TranslationSource.USER },
            { language: Language.UZ, title: 'match', source: TranslationSource.GOOGLE },
            { language: Language.EN, title: 'match', source: TranslationSource.GOOGLE },
          ],
        },
      },
    });

    // Листинг с district_id, которого нет в справочнике → district_name = null.
    await prisma.listing.create({
      data: {
        id: LISTING_NOMATCH,
        ownerId,
        transactionType: TransactionType.SALE,
        propertyType: PropertyType.APARTMENT,
        status: ListingStatus.ACTIVE,
        originalLanguage: Language.RU,
        price: '100000.00',
        currency: Currency.UZS,
        cityId: CITY_ID,
        districtId: UNKNOWN_DISTRICT_ID,
        translations: {
          create: [
            { language: Language.RU, title: 'без района', source: TranslationSource.USER },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { cityId: CITY_ID } });
    await prisma.district.deleteMany({ where: { id: TEST_DISTRICT_ID } });
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it('listAll() includes the seeded Tashkent districts and the test district', async () => {
    const all = await districts.listAll();
    const codes = new Set(all.map((d) => d.code));
    // Сид из миграции 20260613130000.
    expect(codes.has('yunusobod')).toBe(true);
    expect(codes.has('chilonzor')).toBe(true);
    expect(codes.has('test-tuman-209')).toBe(true);

    const seeded = all.find((d) => d.code === 'yunusobod');
    expect(seeded).toMatchObject({
      name_uz: 'Yunusobod',
      name_ru: 'Юнусабад',
      name_en: 'Yunusabad',
    });
  });

  it('namesByIds + pickName resolve the right column per language', async () => {
    const map = await districts.namesByIds([
      TEST_DISTRICT_ID,
      UNKNOWN_DISTRICT_ID,
    ]);
    const names = map.get(TEST_DISTRICT_ID);
    expect(names).toBeDefined();
    expect(districts.pickName(names, Language.UZ)).toBe('Test tuman');
    expect(districts.pickName(names, Language.RU)).toBe('Тест район');
    expect(districts.pickName(names, Language.EN)).toBe('Test district');
    // Несовпадающий id отсутствует в Map → undefined → null.
    expect(map.get(UNKNOWN_DISTRICT_ID)).toBeUndefined();
    expect(districts.pickName(undefined, Language.RU)).toBeNull();
  });

  it('/search embeds district_name on the card language; null when unmatched', async () => {
    const ru = await search.search({ city_id: CITY_ID }, 'ru');
    const matchRu = ru.data.find((d) => d.id === LISTING_MATCH);
    const noMatchRu = ru.data.find((d) => d.id === LISTING_NOMATCH);
    expect(matchRu?.district_name).toBe('Тест район');
    expect(noMatchRu?.district_name).toBeNull();

    const en = await search.search({ city_id: CITY_ID }, 'en');
    expect(en.data.find((d) => d.id === LISTING_MATCH)?.district_name).toBe(
      'Test district',
    );

    const uz = await search.search({ city_id: CITY_ID }, 'uz');
    expect(uz.data.find((d) => d.id === LISTING_MATCH)?.district_name).toBe(
      'Test tuman',
    );
  });

  it('/listings/:id detail embeds district_name on the resolved language', async () => {
    const ru = await listings.findOne(LISTING_MATCH, undefined, 'ru');
    expect(ru.district_name).toBe('Тест район');

    const en = await listings.findOne(LISTING_MATCH, undefined, 'en');
    expect(en.district_name).toBe('Test district');

    const noMatch = await listings.findOne(LISTING_NOMATCH, undefined, 'ru');
    expect(noMatch.district_name).toBeNull();
  });
});
