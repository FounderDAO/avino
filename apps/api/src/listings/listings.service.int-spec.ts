import {
  Currency,
  Language,
  ListingStatus,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { DistrictsService } from '../geo';
import { PrismaService } from '../prisma';
import { TranslationsService } from '../translations';
import { ListingsService } from './listings.service';

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
