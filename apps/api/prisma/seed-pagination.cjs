/**
 * Demo-сид для проверки пагинации публичного поиска (TASK-199 «Показать ещё»).
 *
 * Создаёт N (default 15) ACTIVE SALE-объявлений с разными районами/ценами/
 * комнатами/площадью и 3 фото на каждое (заодно проверяет галерею-счётчик,
 * плюрализацию комнат и форматирование площади). Идемпотентен (фикс. UUID +
 * upsert). НЕ для production.
 *
 *   docker compose exec api node prisma/seed-pagination.cjs
 *   # или с хоста, без файла в образе:
 *   docker compose exec -T api node < apps/api/prisma/seed-pagination.cjs
 *   # число: SEED_N=20 docker compose exec -T -e SEED_N=20 api node < apps/api/prisma/seed-pagination.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const N = Math.max(1, parseInt(process.env.SEED_N || '15', 10));
const OWNER = 'eeee0000-0000-4000-8000-000000000001';

const pad12 = (n) => String(n).padStart(12, '0');
const LID = (i) => `e0000000-0000-4000-8000-${pad12(i)}`;
const TID = (i) => `e1000000-0000-4000-8000-${pad12(i)}`;
const MID = (i, k) => `e2000000-000${k}-4000-8000-${pad12(i)}`;

// 12 районов Ташкента (фикс. UUID из миграции add_districts).
const DISTRICT_IDS = Array.from({ length: 12 }, (_, i) => `d0000000-0000-4000-8000-${pad12(i + 1)}`);

const photoUrl = (s) => `https://picsum.photos/seed/${s}/1024/768`;
const thumbUrl = (s) => `https://picsum.photos/seed/${s}/320/240`;

// Вариативность данных (площадь с разными хвостами — проверка trailing-zeros).
const TYPES = ['APARTMENT', 'HOUSE', 'APARTMENT'];
const AREAS = ['45.00', '52.50', '60.00', '74.30', '88.00', '120.50', '38.00', '99.90'];
const ROOMS = [1, 2, 3, 4, 5];
const DISTRICT_NAMES = [
  'Чиланзар', 'Мирабад', 'Юнусабад', 'Шайхантахур', 'Яккасарай',
  'Мирзо-Улугбек', 'Сергели', 'Алмазар', 'Бектемир', 'Учтепа', 'Яшнабад', 'Янгихаёт',
];

async function upsertOwner() {
  await prisma.user.upsert({
    where: { id: OWNER },
    update: {},
    create: { id: OWNER, email: 'pager@demo.avino.uz', isEmailVerified: true, status: 'ACTIVE', defaultLanguage: 'RU' },
  });
  await prisma.userProfile.upsert({
    where: { userId: OWNER },
    // contactPhone — публичный контактный номер для карточки контакта.
    update: { firstName: 'Пагинация', lastName: 'Тестовый', displayName: 'Пагинация Тестовый', contactPhone: '+998 90 555-00-11' },
    create: { userId: OWNER, firstName: 'Пагинация', lastName: 'Тестовый', displayName: 'Пагинация Тестовый', preferredLanguage: 'RU', contactPhone: '+998 90 555-00-11' },
  });
}

async function main() {
  await upsertOwner();

  const now = Date.now();
  for (let i = 1; i <= N; i += 1) {
    const id = LID(i);
    const type = TYPES[i % TYPES.length];
    const isLandLike = false; // все SALE-жильё с комнатами
    const rooms = ROOMS[i % ROOMS.length];
    const area = AREAS[i % AREAS.length];
    const di = (i - 1) % DISTRICT_IDS.length;
    const districtId = DISTRICT_IDS[di];
    const dname = DISTRICT_NAMES[di];
    const usd = i % 3 === 0;
    const price = usd ? `${60000 + i * 2500}.00` : `${(550 + i * 17) * 1000000}.00`;
    // staggered publishedAt — детерминированный порядок для keyset-курсора.
    const publishedAt = new Date(now - i * 3600 * 1000);

    await prisma.listing.upsert({
      where: { id },
      update: { status: 'ACTIVE', districtId, publishedAt },
      create: {
        id,
        ownerId: OWNER,
        originalLanguage: 'RU',
        transactionType: 'SALE',
        propertyType: type,
        status: 'ACTIVE',
        price,
        currency: usd ? 'USD' : 'UZS',
        area,
        rooms: isLandLike ? null : rooms,
        floor: ((i * 2) % 16) + 1,
        totalFloors: 16,
        yearBuilt: 2010 + (i % 15),
        address: `Ташкент, ${dname}, дом ${i}`,
        districtId,
        latitude: (41.26 + di * 0.01).toFixed(6),
        longitude: (69.2 + di * 0.012).toFixed(6),
        publishedAt,
      },
    });

    await prisma.listingTranslation.upsert({
      where: { id: TID(i) },
      update: { title: `${rooms}-комн. в ${dname} (#${i})` },
      create: { id: TID(i), listingId: id, language: 'RU', title: `${rooms}-комн. в ${dname} (#${i})`, source: 'USER' },
    });

    for (let k = 0; k < 3; k += 1) {
      await prisma.listingMedia.upsert({
        where: { id: MID(i, k) },
        update: { url: photoUrl(`pg-${i}-${k}`), thumbnailUrl: thumbUrl(`pg-${i}-${k}`), sortOrder: k },
        create: {
          id: MID(i, k),
          listingId: id,
          url: photoUrl(`pg-${i}-${k}`),
          thumbnailUrl: thumbUrl(`pg-${i}-${k}`),
          sortOrder: k,
          type: 'IMAGE',
          mimeType: 'image/jpeg',
          width: 1024,
          height: 768,
        },
      });
    }
  }

  const saleActive = await prisma.listing.count({ where: { status: 'ACTIVE', transactionType: 'SALE' } });
  const total = await prisma.listing.count();
  console.log(`seed-pagination: ok — added ${N} ACTIVE SALE; SALE ACTIVE total = ${saleActive}, listings total = ${total}`);
  console.log(saleActive > 24 ? '→ >24: «Показать ещё» сработает на SALE.' : '→ <=24: второй страницы не будет, добавь ещё.');
}

main()
  .catch((e) => { console.error('seed-pagination failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
