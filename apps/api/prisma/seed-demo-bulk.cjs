/**
 * Bulk demo-сид — 25 объявлений для наполнения витрины клиента и админки.
 *
 * Идемпотентен (детерминированные UUID + upsert). НЕ для production.
 * Большинство листингов ACTIVE + publishedAt (видны в публичном поиске
 * `status = 'ACTIVE'`), часть с продвижением TOP/VIP, несколько в статусах
 * NEW/DRAFT для очереди модерации. RU-перевод-заголовок + демо-фото (picsum).
 *
 *   node prisma/seed-demo-bulk.cjs
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Детерминированные UUID (12 hex-символов в последнем сегменте).
const L = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
const M = (n, i) =>
  `dddddddd-${String(n).padStart(4, '0')}-4000-8000-${String(i).padStart(12, '0')}`;
const U = (n) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;

const photoUrl = (seed) => `https://picsum.photos/seed/${seed}/1024/768`;
const thumbUrl = (seed) => `https://picsum.photos/seed/${seed}/320/240`;

const OWNERS = [
  { id: U(1), email: 'owner1@demo.avino.uz', first: 'Алишер', last: 'Каримов' },
  { id: U(2), email: 'owner2@demo.avino.uz', first: 'Дилноза', last: 'Юсупова' },
  { id: U(3), email: 'owner3@demo.avino.uz', first: 'Бекзод', last: 'Рахимов' },
  { id: U(4), email: 'owner4@demo.avino.uz', first: 'Камола', last: 'Турсунова' },
];

const DISTRICTS = [
  'Чиланзар', 'Юнусабад', 'Мирабад', 'Шайхантахур', 'Яккасарай',
  'Учтепа', 'Сергели', 'Мирзо-Улугбек', 'Яшнабад', 'Алмазар',
];

// Шаблоны по типу недвижимости: [propertyType, transactionType, генераторы].
const KINDS = [
  {
    pt: 'APARTMENT', tt: 'SALE', cur: 'UZS',
    title: (r, d) => `${r}-комнатная квартира в ${d}`,
    price: (r) => `${(r * 230 + 290) * 1000000}.00`,
    photo: 'apt',
  },
  {
    pt: 'APARTMENT', tt: 'RENT', cur: 'UZS',
    title: (r, d) => `${r}-комнатная квартира в аренду, ${d}`,
    price: (r) => `${(r * 1.8 + 2.5) * 1000000}.00`,
    photo: 'apt-rent',
  },
  {
    pt: 'NEW_BUILDING', tt: 'SALE', cur: 'USD',
    title: (r, d) => `Новостройка ${r}-комн в ${d}, ЖК «Nest»`,
    price: (r) => `${(r * 28 + 55) * 1000}.00`,
    photo: 'nb',
  },
  {
    pt: 'HOUSE', tt: 'SALE', cur: 'USD',
    title: (r, d) => `Дом ${r * 40 + 100} м² в ${d}`,
    price: (r) => `${(r * 22 + 90) * 1000}.00`,
    photo: 'house',
  },
  {
    pt: 'HOUSE', tt: 'RENT', cur: 'UZS',
    title: (r, d) => `Дом в аренду, ${d}`,
    price: () => `${8 * 1000000}.00`,
    photo: 'house-rent',
  },
  {
    pt: 'COMMERCIAL', tt: 'RENT', cur: 'UZS',
    title: (_r, d) => `Коммерческое помещение под офис, ${d}`,
    price: () => `${15 * 1000000}.00`,
    photo: 'com',
  },
  {
    pt: 'LAND', tt: 'SALE', cur: 'UZS',
    title: (_r, d) => `Земельный участок, ${d}`,
    price: () => `${450 * 1000000}.00`,
    photo: 'land',
  },
];

// Статусы: первые ~20 ACTIVE (видны на клиенте), затем NEW/DRAFT для модерации.
function statusFor(i) {
  if (i <= 20) return 'ACTIVE';
  if (i <= 23) return 'NEW';
  return 'DRAFT';
}

// Продвижение: каждый 5-й — VIP, каждый 3-й — TOP, остальные NORMAL.
function promoFor(i) {
  if (i % 5 === 0) return 'VIP';
  if (i % 3 === 0) return 'TOP';
  return 'NORMAL';
}

async function upsertUser(o) {
  await prisma.user.upsert({
    where: { id: o.id },
    update: {},
    create: {
      id: o.id, email: o.email, isEmailVerified: true,
      status: 'ACTIVE', defaultLanguage: 'RU',
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: o.id },
    update: { firstName: o.first, lastName: o.last, displayName: `${o.first} ${o.last}` },
    create: {
      userId: o.id, firstName: o.first, lastName: o.last,
      displayName: `${o.first} ${o.last}`, preferredLanguage: 'RU',
    },
  });
}

async function upsertListing(n) {
  const kind = KINDS[n % KINDS.length];
  const owner = OWNERS[n % OWNERS.length];
  const district = DISTRICTS[n % DISTRICTS.length];
  const rooms = kind.pt === 'LAND' || kind.pt === 'COMMERCIAL' ? null : (n % 4) + 1;
  const status = statusFor(n);
  const promo = status === 'ACTIVE' ? promoFor(n) : 'NORMAL';
  const published = status === 'ACTIVE';
  // Разнесём даты публикации, чтобы сортировка по свежести имела смысл.
  const publishedAt = published
    ? new Date(Date.now() - n * 6 * 3600 * 1000)
    : null;

  const area =
    kind.pt === 'LAND'
      ? `${(n % 6) * 100 + 300}.00`
      : `${(rooms || 2) * 18 + 40}.00`;
  const floor = kind.pt === 'APARTMENT' || kind.pt === 'NEW_BUILDING' ? (n % 12) + 2 : null;
  const totalFloors = floor ? floor + (n % 5) + 2 : null;
  const yearBuilt = kind.pt === 'LAND' ? null : 2008 + (n % 17);

  const id = L(n);
  const data = {
    transactionType: kind.tt,
    propertyType: kind.pt,
    status,
    price: kind.price(rooms || 1),
    currency: kind.cur,
    area,
    rooms,
    floor,
    totalFloors,
    yearBuilt,
    address: `Ташкент, ${district}, ${(n % 30) + 1} квартал`,
    promotionType: promo,
    publishedAt,
    latitude: (41.2 + (n % 20) * 0.01).toFixed(6),
    longitude: (69.18 + (n % 20) * 0.012).toFixed(6),
  };

  await prisma.listing.upsert({
    where: { id },
    update: {
      status, promotionType: promo, publishedAt,
      price: data.price, address: data.address,
    },
    create: { id, ownerId: owner.id, originalLanguage: 'RU', ...data },
  });

  const title = kind.title(rooms || 2, district);
  await prisma.listingTranslation.upsert({
    where: { id: T(n) },
    update: { title },
    create: { id: T(n), listingId: id, language: 'RU', title, source: 'USER' },
  });

  const photoCount = (n % 3) + 3; // 3..5 фото
  for (let i = 0; i < photoCount; i += 1) {
    const seed = `avino-${kind.photo}-${n}-${i}`;
    await prisma.listingMedia.upsert({
      where: { id: M(n, i) },
      update: { url: photoUrl(seed), thumbnailUrl: thumbUrl(seed), sortOrder: i },
      create: {
        id: M(n, i), listingId: id,
        url: photoUrl(seed), thumbnailUrl: thumbUrl(seed),
        sortOrder: i, type: 'IMAGE', mimeType: 'image/jpeg',
        width: 1024, height: 768,
      },
    });
  }
}

async function main() {
  for (const o of OWNERS) await upsertUser(o);

  const TOTAL = 25;
  for (let n = 1; n <= TOTAL; n += 1) await upsertListing(n);

  const total = await prisma.listing.count();
  const active = await prisma.listing.count({ where: { status: 'ACTIVE' } });
  console.log(
    `seed-demo-bulk: ok — создано/обновлено ${TOTAL} объявлений ` +
      `(всего в БД: ${total}, ACTIVE: ${active})`,
  );
}

main()
  .catch((e) => {
    console.error('seed-demo-bulk failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
