/**
 * seed-regions.cjs — по N (default 3) ACTIVE SALE-объявления в КАЖДОМ регионе.
 *
 * Для ручной проверки каскада «Регион → Район» и фильтра `region_id` в /search
 * (фича ADR-0113). Районы выбираются РАНТАЙМ-ЗАПРОСОМ по region_id, поэтому один
 * файл одинаково работает локально и на staging (district UUID не хардкодятся).
 *
 * Фото: качаются и АПЛОАДЯТСЯ В R2 (как seed-catalog.cjs), в listing_media пишется
 * storage_key — иначе sign-on-read (ADR-0086) превращает внешний URL в
 * несуществующий R2-ключ → presigned 404 и карточка показывает заглушку «AVINO».
 * Пул фото идемпотентен (HeadObject → пропуск, если уже залит). Если S3/R2 не
 * сконфигурирован — листинги всё равно создаются, но без фото (с предупреждением).
 *
 * Идемпотентен: фиксированные UUID (префикс e3*) + upsert. НЕ для production-данных.
 * Требует накатанную миграцию add_regions (таблица regions заполнена).
 *
 *   # локально (api из docker-compose.yml):
 *   docker compose exec -T api node < apps/api/prisma/seed-regions.cjs
 *
 *   # staging (overlay-файл):
 *   docker compose -f docker-compose.staging.yml exec -T api node < apps/api/prisma/seed-regions.cjs
 *
 *   # другое число на регион:
 *   SEED_PER_REGION=5 docker compose exec -T -e SEED_PER_REGION=5 api node < apps/api/prisma/seed-regions.cjs
 */

const { PrismaClient } = require('@prisma/client');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

const prisma = new PrismaClient();

const PER_REGION = Math.max(1, parseInt(process.env.SEED_PER_REGION || '3', 10));
const OWNER = 'eeee0000-0000-4000-8000-000000000002';

const pad12 = (n) => String(n).padStart(12, '0');
const LID = (i) => `e3000000-0000-4000-8000-${pad12(i)}`;          // listing
const TID = (i) => `e3100000-0000-4000-8000-${pad12(i)}`;          // translation
const MID = (i, k) => `e3200000-000${k}-4000-8000-${pad12(i)}`;    // media (k: 0..2)

// Вариативность карточек.
const TYPES = ['APARTMENT', 'HOUSE', 'NEW_BUILDING'];
const AREAS = ['45.00', '62.50', '88.00'];
const ROOMS = [2, 3, 4];

// Приблизительные центры областей (по region.code) — чтобы пины ложились в свой
// регион, а карта на /search автоподгонялась (autoFit по bounds пинов). Без
// координат листинг не даёт пина и карта стоит на Ташкенте.
const REGION_CENTER = {
  andijon: [40.78, 72.34],
  buxoro: [39.77, 64.42],
  'toshkent-shahri': [41.31, 69.28],
  jizzax: [40.12, 67.84],
  qashqadaryo: [38.86, 65.79],
  navoiy: [40.10, 65.38],
  namangan: [41.00, 71.67],
  qoraqalpogiston: [42.46, 59.61],
  samarqand: [39.65, 66.96],
  surxondaryo: [38.07, 67.27],
  sirdaryo: [40.49, 68.78],
  toshkent: [41.00, 69.60],
  fargona: [40.39, 71.78],
  xorazm: [41.55, 60.63],
};
const TASHKENT_CENTER = [41.311, 69.28];

// ───────────────────────────── S3 / R2 (как seed-catalog.cjs) ────────────────
const S3 = {
  endpoint: process.env.S3_ENDPOINT,
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION || 'auto',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
};
const S3_READY = Boolean(S3.bucket && S3.accessKeyId && S3.secretAccessKey);

let s3;
function s3client() {
  if (!s3) {
    s3 = new S3Client({
      region: S3.region,
      forcePathStyle: S3.forcePathStyle,
      credentials: { accessKeyId: S3.accessKeyId, secretAccessKey: S3.secretAccessKey },
      ...(S3.endpoint ? { endpoint: S3.endpoint } : {}),
    });
  }
  return s3;
}

/** Стабильный URL для listing_media.url (без подписи); extractKey(url) round-trip'ит ключ. */
function objectUrl(key) {
  if (S3.publicBaseUrl) return `${S3.publicBaseUrl}/${key}`;
  const base = (S3.endpoint || '').replace(/\/+$/, '');
  return `${base}/${S3.bucket}/${key}`;
}

async function fetchImage(lock) {
  const sources = [
    `https://loremflickr.com/1024/768/apartment,interior?lock=${lock}`,
    `https://picsum.photos/seed/avino-region-${lock}/1024/768`,
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 2000) return buf; // отсекаем серую заглушку loremflickr
    } catch {
      /* следующий источник */
    }
  }
  throw new Error(`не удалось скачать картинку (lock=${lock})`);
}

async function exists(key) {
  try {
    await s3client().send(new HeadObjectCommand({ Bucket: S3.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// Пул из 6 фото, реюзается по кругу на все объявления (3 фото на карточку).
const POOL_SIZE = 6;
const poolKeys = []; // [{ key, url }]

async function ensurePool() {
  let uploaded = 0;
  for (let i = 1; i <= POOL_SIZE; i += 1) {
    const key = `seed/regions/${i}.jpg`;
    poolKeys.push({ key, url: objectUrl(key) });
    if (await exists(key)) continue;
    const buf = await fetchImage(2000 + i);
    await s3client().send(
      new PutObjectCommand({ Bucket: S3.bucket, Key: key, Body: buf, ContentType: 'image/jpeg' }),
    );
    uploaded += 1;
    console.log(`  ↑ R2 ${key} (${buf.length} b)`);
  }
  console.log(`пул фото: ${uploaded} новых, остальные уже были в R2 (всего ${POOL_SIZE}).`);
}

async function upsertOwner() {
  await prisma.user.upsert({
    where: { id: OWNER },
    update: {},
    create: { id: OWNER, email: 'regions@demo.avino.uz', isEmailVerified: true, status: 'ACTIVE', defaultLanguage: 'RU' },
  });
  await prisma.userProfile.upsert({
    where: { userId: OWNER },
    update: { firstName: 'Регионы', lastName: 'Тест', displayName: 'Регионы Тест', contactPhone: '+998 90 555-00-22' },
    create: { userId: OWNER, firstName: 'Регионы', lastName: 'Тест', displayName: 'Регионы Тест', preferredLanguage: 'RU', contactPhone: '+998 90 555-00-22' },
  });
}

async function main() {
  if (S3_READY) {
    await ensurePool();
  } else {
    console.warn(
      'seed-regions: S3/R2 не сконфигурирован (нет S3_BUCKET/ACCESS_KEY) — ' +
        'создаю объявления БЕЗ фото (карточки покажут заглушку). Задай S3_* для фото.',
    );
  }

  await upsertOwner();

  const regions = await prisma.region.findMany({ orderBy: { sortOrder: 'asc' } });
  if (regions.length === 0) {
    console.error('seed-regions: таблица regions пуста — сначала накати миграцию add_regions (prisma migrate deploy).');
    process.exit(1);
  }

  const now = Date.now();
  let i = 0;            // глобальный счётчик (UUID + детерминированная цена/время/фото)
  let created = 0;
  const summary = [];

  for (const region of regions) {
    // До PER_REGION районов региона по алфавиту (детерминированно). Если районов
    // меньше — крутим по кругу, чтобы всё равно создать ровно PER_REGION листингов.
    const districts = await prisma.district.findMany({
      where: { regionId: region.id },
      orderBy: { nameRu: 'asc' },
      take: PER_REGION,
    });
    if (districts.length === 0) {
      summary.push(`${region.nameRu}: 0 районов — пропуск`);
      continue;
    }

    for (let j = 0; j < PER_REGION; j += 1) {
      const district = districts[j % districts.length];
      i += 1;
      const id = LID(i);
      const type = TYPES[i % TYPES.length];
      const rooms = ROOMS[j % ROOMS.length];
      const area = AREAS[j % AREAS.length];
      const usd = i % 3 === 0;
      const price = usd ? `${55000 + i * 1500}.00` : `${(500 + i * 13) * 1000000}.00`;
      // staggered publishedAt — детерминированный порядок keyset-курсора.
      const publishedAt = new Date(now - i * 1800 * 1000);
      const title = `${rooms}-комн. · ${region.nameRu} (${district.nameRu})`;

      // Координаты: центр региона + небольшой джиттер по j (пины не накладываются,
      // карта /search автоподгоняется под bounds).
      const [clat, clng] = REGION_CENTER[region.code] || TASHKENT_CENTER;
      const latitude = (clat + (j - 1) * 0.012).toFixed(6);
      const longitude = (clng + (j - 1) * 0.012).toFixed(6);

      await prisma.listing.upsert({
        where: { id },
        update: { status: 'ACTIVE', districtId: district.id, publishedAt, latitude, longitude },
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
          rooms,
          floor: ((i * 2) % 12) + 1,
          totalFloors: 12,
          yearBuilt: 2008 + (i % 17),
          address: `${region.nameRu}, ${district.nameRu}, дом ${i}`,
          districtId: district.id,
          latitude,
          longitude,
          publishedAt,
        },
      });

      await prisma.listingTranslation.upsert({
        where: { id: TID(i) },
        update: { title },
        create: { id: TID(i), listingId: id, language: 'RU', title, source: 'USER' },
      });

      // 3 фото из пула (по кругу) — реальные R2-объекты со storage_key.
      if (poolKeys.length) {
        for (let k = 0; k < 3; k += 1) {
          const ph = poolKeys[(i * 3 + k) % poolKeys.length];
          await prisma.listingMedia.upsert({
            where: { id: MID(i, k) },
            update: { url: ph.url, storageKey: ph.key, thumbnailUrl: ph.url, sortOrder: k },
            create: {
              id: MID(i, k),
              listingId: id,
              url: ph.url,
              storageKey: ph.key, // source of truth для sign-on-read (ADR-0086)
              thumbnailUrl: ph.url,
              sortOrder: k,
              type: 'IMAGE',
              mimeType: 'image/jpeg',
              width: 1024,
              height: 768,
            },
          });
        }
      }
      created += 1;
    }
    summary.push(`${region.nameRu}: +${PER_REGION} (район(ы): ${districts.map((d) => d.nameRu).join(', ')})`);
  }

  const activeSale = await prisma.listing.count({ where: { status: 'ACTIVE', transactionType: 'SALE' } });
  console.log(`seed-regions: ok — создано/обновлено ${created} ACTIVE SALE в ${regions.length} регионах (по ${PER_REGION}).`);
  summary.forEach((s) => console.log('  •', s));
  console.log(`Итого ACTIVE SALE в БД: ${activeSale}.`);
}

main()
  .catch((e) => { console.error('seed-regions failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
