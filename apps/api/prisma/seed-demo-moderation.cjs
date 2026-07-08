/**
 * Demo-сид для очереди модерации (TASK-220, превью карточки «Создатель»).
 *
 * Создаёт владельца с ПОЛНЫМ профилем (имя/фамилия/display_name/contact_phone)
 * и ролями USER+AGENT, плюс 2 NEW-объявления с заполненными площадью/комнатами/
 * этажом/годом/адресом/описанием/особенностями и 4 фото каждое — чтобы карточка
 * модерации выглядела «как в проде». Идемпотентен (фикс. UUID + upsert).
 * НЕ для production.
 *
 *   docker compose exec -T api node < apps/api/prisma/seed-demo-moderation.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OWNER = 'aaaa1111-0000-4000-8000-000000000001';
const photoUrl = (s) => `https://picsum.photos/seed/${s}/1024/768`;
const thumbUrl = (s) => `https://picsum.photos/seed/${s}/480/360`;

// Фикс. UUID районов Ташкента (миграция add_districts) — те же, что в seed-pagination.
const pad12 = (n) => String(n).padStart(12, '0');
const DIST = (i) => `d0000000-0000-4000-8000-${pad12(i)}`;

async function ensureRole(code, description) {
  return prisma.role.upsert({
    where: { code },
    update: {},
    create: { code, description },
  });
}

async function ensureOwner() {
  await prisma.user.upsert({
    where: { id: OWNER },
    update: {
      email: 'dilshod.rahimov@avino.uz',
      phone: '+998902202220',
      isEmailVerified: true,
      isPhoneVerified: true,
      status: 'ACTIVE',
    },
    create: {
      id: OWNER,
      email: 'dilshod.rahimov@avino.uz',
      phone: '+998902202220',
      isEmailVerified: true,
      isPhoneVerified: true,
      status: 'ACTIVE',
      defaultLanguage: 'RU',
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: OWNER },
    update: {
      firstName: 'Дилшод',
      lastName: 'Рахимов',
      displayName: 'Дилшод Рахимов · Avino Estate',
      contactPhone: '+998 90 123-45-67',
      preferredLanguage: 'RU',
    },
    create: {
      userId: OWNER,
      firstName: 'Дилшод',
      lastName: 'Рахимов',
      displayName: 'Дилшод Рахимов · Avino Estate',
      contactPhone: '+998 90 123-45-67',
      preferredLanguage: 'RU',
    },
  });
  for (const code of ['USER', 'AGENT']) {
    const role = await ensureRole(
      code,
      code === 'AGENT' ? 'Агент по недвижимости.' : 'Базовый пользователь.',
    );
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: OWNER, roleId: role.id } },
      update: {},
      create: { userId: OWNER, roleId: role.id },
    });
  }
}

const LISTINGS = [
  {
    id: 'aaaa2222-0000-4000-8000-000000000001',
    tid: 'aaaa3333-0000-4000-8000-000000000001',
    propertyType: 'APARTMENT',
    transactionType: 'SALE',
    price: '95000.00',
    currency: 'USD',
    area: '78.50',
    rooms: 3,
    floor: 7,
    totalFloors: 12,
    yearBuilt: 2021,
    district: 3,
    address: 'Ташкент, Юнусабадский р-н, ул. Амира Темура, 108',
    title: '3-комнатная квартира с дизайнерским ремонтом, Юнусабад',
    description:
      'Просторная 3-комнатная квартира 78.5 м² на 7 этаже 12-этажного дома 2021 года. ' +
      'Авторский ремонт, кухня-гостиная, две спальни, гардеробная, два санузла. ' +
      'Тёплые полы, кондиционеры, встроенная техника. Закрытый двор, паркинг, охрана.',
    features: 'Кондиционер; Встроенная кухня; Парковка; Охрана; Лифт; Тёплый пол',
  },
  {
    id: 'aaaa2222-0000-4000-8000-000000000002',
    tid: 'aaaa3333-0000-4000-8000-000000000002',
    propertyType: 'HOUSE',
    transactionType: 'SALE',
    price: '240000.00',
    currency: 'USD',
    area: '180.00',
    rooms: 5,
    floor: 2,
    totalFloors: 2,
    yearBuilt: 2018,
    district: 6,
    address: 'Ташкент, Мирзо-Улугбекский р-н, мкр Ц-5, дом 12',
    title: 'Двухэтажный дом 180 м² с участком 6 соток, Мирзо-Улугбек',
    description:
      'Добротный кирпичный дом 180 м² на участке 6 соток, 2018 года постройки. ' +
      'Пять комнат, две веранды, гараж на две машины, сад с плодовыми деревьями. ' +
      'Все коммуникации центральные, отопление газовое, скважина для полива.',
    features: 'Гараж; Участок 6 соток; Газ; Сад; Веранда; Кладовая',
  },
];

async function main() {
  await ensureOwner();

  const now = Date.now();
  for (let n = 0; n < LISTINGS.length; n += 1) {
    const L = LISTINGS[n];
    const createdAt = new Date(now - n * 60 * 1000); // ~сейчас, шаг 1 мин (свежее очереди)
    await prisma.listing.upsert({
      where: { id: L.id },
      update: { status: 'NEW', ownerId: OWNER, createdAt },
      create: {
        id: L.id,
        ownerId: OWNER,
        originalLanguage: 'RU',
        transactionType: L.transactionType,
        propertyType: L.propertyType,
        status: 'NEW',
        price: L.price,
        currency: L.currency,
        area: L.area,
        rooms: L.rooms,
        floor: L.floor,
        totalFloors: L.totalFloors,
        yearBuilt: L.yearBuilt,
        address: L.address,
        districtId: DIST(L.district),
        latitude: '41.350000',
        longitude: '69.290000',
        createdAt,
      },
    });

    await prisma.listingTranslation.upsert({
      where: { id: L.tid },
      update: {
        title: L.title,
        description: L.description,
        featuresText: L.features,
      },
      create: {
        id: L.tid,
        listingId: L.id,
        language: 'RU',
        title: L.title,
        description: L.description,
        featuresText: L.features,
        source: 'USER',
      },
    });

    for (let k = 0; k < 4; k += 1) {
      const mid = `aaaa4444-000${k}-4000-8000-${pad12(n + 1)}`;
      const seed = `avino-mod-${n + 1}-${k}`;
      await prisma.listingMedia.upsert({
        where: { id: mid },
        update: { url: photoUrl(seed), thumbnailUrl: thumbUrl(seed), sortOrder: k },
        create: {
          id: mid,
          listingId: L.id,
          url: photoUrl(seed),
          thumbnailUrl: thumbUrl(seed),
          sortOrder: k,
          type: 'IMAGE',
          mimeType: 'image/jpeg',
          width: 1024,
          height: 768,
        },
      });
    }
  }

  const queue = await prisma.listing.count({ where: { status: 'NEW' } });
  console.log(`seed-demo-moderation: ok — owner + ${LISTINGS.length} NEW listings; queue (NEW) total = ${queue}`);
}

main()
  .catch((e) => {
    console.error('seed-demo-moderation failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
