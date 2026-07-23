/**
 * Demo-сид для локальной проверки админки (ADMIN-17 live-verify).
 *
 * Идемпотентен (фиксированные UUID + upsert). НЕ для production. Создаёт
 * владельцев/репортёра, несколько объявлений в разных статусах (NEW для очереди
 * модерации, ACTIVE/DRAFT) с RU-переводом-заголовком, демо-фото (picsum, без
 * аплоадов/ключей) и пару жалоб.
 *
 *   docker compose exec api node prisma/seed-demo.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const O1 = '11111111-1111-1111-1111-111111111111';
const O2 = '22222222-2222-2222-2222-222222222222';
const R1 = '33333333-3333-3333-3333-333333333333';

// Районы Ташкента (фикс. UUID из миграции 20260613130000_add_districts).
// district_id нужен, чтобы поиск/плитки «Районы» (?district_id=) давали выдачу.
const DISTRICT = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const D = {
  chilonzor: DISTRICT(2),
  mirobod: DISTRICT(3),
  shayxontohur: DISTRICT(7),
  yunusobod: DISTRICT(12),
};
const DISTRICT_IDS = Array.from({ length: 12 }, (_, i) => DISTRICT(i + 1));

const L = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;
const T = (n) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
const C = (n) => `cccccccc-0000-4000-8000-00000000000${n}`;
// Медиа: id = dddddddd-000<listing>-4000-8000-<photoIdx, 12 знаков>.
const M = (listing, idx) =>
  `dddddddd-000${listing}-4000-8000-${String(idx).padStart(12, '0')}`;

// Демо-фото без ключей/аплоадов: picsum по seed (стабильны между прогонами).
const photoUrl = (seed) => `https://picsum.photos/seed/${seed}/1024/768`;
const thumbUrl = (seed) => `https://picsum.photos/seed/${seed}/320/240`;

async function upsertUser(id, email, first, last, contactPhone = null) {
  await prisma.user.upsert({
    where: { id },
    update: {},
    create: {
      id,
      email,
      isEmailVerified: true,
      status: 'ACTIVE',
      defaultLanguage: 'RU',
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: id },
    // contactPhone — публичный контактный номер (показывается в карточке
    // контакта «Показать телефон»; buildContact: contact_phone ?? owner.phone).
    update: {
      firstName: first,
      lastName: last,
      displayName: `${first} ${last}`,
      contactPhone,
    },
    create: {
      userId: id,
      firstName: first,
      lastName: last,
      displayName: `${first} ${last}`,
      preferredLanguage: 'RU',
      contactPhone,
    },
  });
}

async function upsertListing(n, owner, data, title, photoSeeds = []) {
  const id = L(n);
  await prisma.listing.upsert({
    where: { id },
    // districtId: undefined → Prisma пропускает поле (не затирает backfill).
    update: {
      status: data.status,
      latitude: data.latitude,
      longitude: data.longitude,
      districtId: data.districtId,
    },
    create: { id, ownerId: owner, originalLanguage: 'RU', ...data },
  });
  await prisma.listingTranslation.upsert({
    where: { id: T(n) },
    update: { title },
    create: { id: T(n), listingId: id, language: 'RU', title, source: 'USER' },
  });
  for (let i = 0; i < photoSeeds.length; i += 1) {
    const seed = photoSeeds[i];
    await prisma.listingMedia.upsert({
      where: { id: M(n, i) },
      update: { url: photoUrl(seed), thumbnailUrl: thumbUrl(seed), sortOrder: i },
      create: {
        id: M(n, i),
        listingId: id,
        url: photoUrl(seed),
        thumbnailUrl: thumbUrl(seed),
        sortOrder: i,
        type: 'IMAGE',
        mimeType: 'image/jpeg',
        width: 1024,
        height: 768,
      },
    });
  }
}

async function upsertComplaint(id, listingId, reporterId, reason, details, status) {
  await prisma.complaint.upsert({
    where: { id },
    update: { status, reason, details },
    create: { id, listingId, reporterId, reason, details, status },
  });
}

/**
 * Backfill district_id для листингов без района (идемпотентно — трогает только
 * NULL): сначала семантически (адрес содержит имя района), затем round-robin по
 * 12 районам, чтобы поиск/плитки по любому району давали выдачу. Покрывает и
 * листинги, заведённые вне этого сидера (ad-hoc live-verify фикстуры).
 */
async function backfillDistricts() {
  const districts = await prisma.district.findMany({ select: { id: true, nameRu: true } });
  for (const d of districts) {
    await prisma.listing.updateMany({
      where: { districtId: null, address: { contains: d.nameRu, mode: 'insensitive' } },
      data: { districtId: d.id },
    });
  }
  const rest = await prisma.listing.findMany({
    where: { districtId: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  for (let i = 0; i < rest.length; i += 1) {
    await prisma.listing.update({
      where: { id: rest[i].id },
      data: { districtId: DISTRICT_IDS[i % DISTRICT_IDS.length] },
    });
  }
}

async function main() {
  await upsertUser(O1, 'owner1@demo.avino.uz', 'Алишер', 'Каримов', '+998 90 333-11-22');
  await upsertUser(O2, 'owner2@demo.avino.uz', 'Дилноза', 'Юсупова', '+998 90 333-44-55');
  await upsertUser(R1, 'reporter@demo.avino.uz', 'Бекзод', 'Рахимов', '+998 90 333-66-77');

  await upsertListing(
    1, O1,
    {
      transactionType: 'SALE', propertyType: 'APARTMENT', status: 'NEW',
      price: '650000000.00', currency: 'UZS', area: '62.50', rooms: 3,
      floor: 5, totalFloors: 9, yearBuilt: 2019,
      address: 'Ташкент, Чиланзар, 12 квартал', districtId: D.chilonzor,
      latitude: '41.279500', longitude: '69.204600',
    },
    '3-комнатная квартира в Чиланзаре',
    ['avino-apt-1a', 'avino-apt-1b', 'avino-apt-1c', 'avino-apt-1d'],
  );

  await upsertListing(
    2, O2,
    {
      transactionType: 'RENT', propertyType: 'HOUSE', status: 'NEW',
      price: '8000000.00', currency: 'UZS', area: '180.00', rooms: 5,
      floor: 1, totalFloors: 2, yearBuilt: 2015,
      address: 'Ташкент, Юнусабад, массив Богишамол', districtId: D.yunusobod,
      latitude: '41.367200', longitude: '69.287000',
    },
    'Дом в аренду на Юнусабаде',
    ['avino-house-2a', 'avino-house-2b', 'avino-house-2c'],
  );

  await upsertListing(
    3, O1,
    {
      transactionType: 'SALE', propertyType: 'APARTMENT', status: 'ACTIVE',
      price: '95000.00', currency: 'USD', area: '78.00', rooms: 2,
      floor: 11, totalFloors: 16, yearBuilt: 2024,
      address: 'Ташкент, Мирабад, ЖК «Nest One»', districtId: D.mirobod,
      latitude: '41.293700', longitude: '69.278000',
      publishedAt: new Date(),
    },
    'Новостройка 2-комн в ЖК Nest One',
    ['avino-nb-3a', 'avino-nb-3b', 'avino-nb-3c', 'avino-nb-3d', 'avino-nb-3e'],
  );

  await upsertListing(
    4, O2,
    {
      transactionType: 'RENT', propertyType: 'COMMERCIAL', status: 'DRAFT',
      price: '15000000.00', currency: 'UZS', area: '120.00',
      address: 'Ташкент, Шайхантахур, ул. Навои', districtId: D.shayxontohur,
      latitude: '41.327500', longitude: '69.254500',
    },
    'Коммерческое помещение под офис',
    ['avino-com-4a', 'avino-com-4b'],
  );

  await upsertListing(
    5, O1,
    {
      transactionType: 'SALE', propertyType: 'LAND', status: 'NEW',
      price: '450000000.00', currency: 'UZS', area: '600.00',
      address: 'Ташкентская область, Кибрай',
      latitude: '41.389700', longitude: '69.464600',
    },
    'Земельный участок 6 соток в Кибрае',
    ['avino-land-5a', 'avino-land-5b'],
  );

  await upsertComplaint(
    C(1), L(3), R1,
    'Спам / дубликат', 'Это объявление дублируется несколько раз.', 'NEW',
  );
  await upsertComplaint(
    C(2), L(1), null,
    'Недостоверная цена', 'Цена в объявлении не соответствует реальной.', 'NEW',
  );
  await upsertComplaint(
    C(3), L(3), R1,
    'Мошенничество', 'Просят предоплату до показа.', 'IN_REVIEW',
  );

  await backfillDistricts();

  const listings = await prisma.listing.count();
  const complaints = await prisma.complaint.count();
  console.log(`seed-demo: ok — listings total ${listings}, complaints total ${complaints}`);
}

main()
  .catch((e) => {
    console.error('seed-demo failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
