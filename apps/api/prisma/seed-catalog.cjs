/**
 * seed-catalog.cjs — наполнение каталога демо-объявлениями для ТЕСТ-СТЕНДА (staging).
 *
 * Создаёт N (default 36) объявлений с РАБОЧИМИ фото. Ключевой момент: из-за
 * sign-on-read (ADR-0086) read-path всегда заново подписывает URL из object-key.
 * Поэтому внешний picsum-URL в listing_media НЕ работает — extractKey(url)
 * превратил бы его в несуществующий R2-ключ → presigned 404 (NoSuchKey).
 * Здесь картинки реально СКАЧИВАЮТСЯ (loremflickr → picsum fallback) и
 * АПЛОАДЯТСЯ В R2 контейнера, в listing_media пишется storage_key — ровно как
 * при настоящей загрузке. Так фото отображаются и не «протухают».
 *
 * Идемпотентен: фикс. UUID + upsert; пул картинок грузится один раз (HeadObject
 * skip). Переносим: всё берётся из process.env контейнера (DATABASE_URL + S3_*),
 * поэтому одинаково работает локально и на staging.
 *
 *   # staging (api в этом стеке — dev, как и локально):
 *   docker compose -f docker-compose.staging.yml exec -T api \
 *     node < apps/api/prisma/seed-catalog.cjs
 *
 *   # локально:
 *   docker compose exec -T api node < apps/api/prisma/seed-catalog.cjs
 *
 *   # своё число объявлений:
 *   docker compose exec -T -e SEED_N=40 api node < apps/api/prisma/seed-catalog.cjs
 *
 * Требования на стенде: у api заданы S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/
 * S3_SECRET_ACCESS_KEY и есть исходящий интернет (скачать картинки). Без S3
 * скрипт падает на preflight (без R2 фото всё равно не показались бы).
 */

const { PrismaClient } = require('@prisma/client');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

const prisma = new PrismaClient();

const N = Math.min(60, Math.max(1, parseInt(process.env.SEED_N || '36', 10)));

// ───────────────────────────── S3 / R2 ──────────────────────────────────────
const S3 = {
  endpoint: process.env.S3_ENDPOINT,
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION || 'auto',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
};

function preflight() {
  const missing = [];
  if (!S3.bucket) missing.push('S3_BUCKET');
  if (!S3.accessKeyId) missing.push('S3_ACCESS_KEY_ID');
  if (!S3.secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY');
  if (missing.length) {
    console.error(
      `seed-catalog: S3/R2 не сконфигурирован (${missing.join(', ')}). ` +
        'Без хранилища фото не будут отображаться (sign-on-read, ADR-0086). ' +
        'Задай S3_* в env стенда и повтори.',
    );
    process.exit(1);
  }
}

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

/**
 * URL для колонки listing_media.url — стабильный, БЕЗ подписи. На чтении он не
 * используется напрямую (берётся storage_key), но extractKey(url) должен
 * корректно из него восстанавливать ключ для legacy-фолбэка. Path-style
 * `${endpoint}/${bucket}/${key}` и публичный `${base}/${key}` оба round-trip'ят.
 */
function objectUrl(key) {
  if (S3.publicBaseUrl) return `${S3.publicBaseUrl}/${key}`;
  const base = (S3.endpoint || '').replace(/\/+$/, '');
  return `${base}/${S3.bucket}/${key}`;
}

// ───────────────────────────── Пул картинок ─────────────────────────────────
// Тематические фото по категориям. lock/seed делают картинку детерминированной
// между прогонами, чтобы пул был стабилен. n — сколько разных кадров в категории.
const POOL = [
  { cat: 'building', q: 'apartment building,facade', n: 3 },
  { cat: 'living', q: 'living room,interior', n: 4 },
  { cat: 'kitchen', q: 'kitchen,interior', n: 3 },
  { cat: 'bedroom', q: 'bedroom,interior', n: 3 },
  { cat: 'bathroom', q: 'bathroom,interior', n: 2 },
  { cat: 'house', q: 'house,exterior', n: 3 },
  { cat: 'garden', q: 'house,garden', n: 2 },
  { cat: 'office', q: 'office,interior', n: 2 },
  { cat: 'retail', q: 'shop,storefront', n: 2 },
  { cat: 'land', q: 'land,field', n: 2 },
];

const poolKeys = {}; // cat -> [{ key, url }]

async function fetchImage(q, lock) {
  const sources = [
    `https://loremflickr.com/1024/768/${encodeURIComponent(q)}?lock=${lock}`,
    `https://picsum.photos/seed/avino-${lock}/1024/768`,
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 2000) return buf; // отсекаем серую заглушку loremflickr
    } catch {
      /* пробуем следующий источник */
    }
  }
  throw new Error(`не удалось скачать картинку для «${q}» (lock=${lock})`);
}

async function exists(key) {
  try {
    await s3client().send(new HeadObjectCommand({ Bucket: S3.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function ensurePool() {
  let uploaded = 0;
  let pi = 0;
  for (const p of POOL) {
    poolKeys[p.cat] = [];
    for (let i = 0; i < p.n; i += 1) {
      const key = `seed/catalog/${p.cat}-${i + 1}.jpg`;
      poolKeys[p.cat].push({ key, url: objectUrl(key) });
      if (await exists(key)) continue;
      const lock = 1000 + pi * 50 + i; // стабильный, различимый по категориям
      const buf = await fetchImage(p.q, lock);
      await s3client().send(
        new PutObjectCommand({
          Bucket: S3.bucket,
          Key: key,
          Body: buf,
          ContentType: 'image/jpeg',
          // R2 без ACL (S3_DISABLE_ACL); приватный режим — без public-read.
        }),
      );
      uploaded += 1;
      console.log(`  ↑ R2 ${key} (${buf.length} b)`);
    }
    pi += 1;
  }
  console.log(`пул фото: ${uploaded} новых, остальные уже были в R2`);
}

// ───────────────────────────── Справочники ──────────────────────────────────
// Центры районов Ташкента (по коду из таблицы districts). Фолбэк — центр города.
const CENTER = {
  bektemir: [41.2069, 69.3344],
  chilonzor: [41.2733, 69.2044],
  mirobod: [41.29, 69.27],
  'mirzo-ulugbek': [41.326, 69.334],
  olmazor: [41.35, 69.205],
  sergeli: [41.228, 69.22],
  shayxontohur: [41.3275, 69.23],
  uchtepa: [41.298, 69.175],
  yakkasaroy: [41.287, 69.248],
  yashnobod: [41.288, 69.33],
  yangihayot: [41.215, 69.205],
  yunusobod: [41.3672, 69.287],
};
const TASHKENT = [41.3111, 69.2797];

const TYPE_W = {
  APARTMENT: { ru: 'квартира', uz: 'kvartira', en: 'apartment' },
  HOUSE: { ru: 'дом', uz: 'uy', en: 'house' },
};
const ZHK = ['Nest One', 'Boulevard', 'Greenpark', 'Akay City', 'Mirabad Avenue', 'Tashkent City', 'Yangi Hayot', 'Sergeli City'];
const STREETS = ['ул. Амира Темура', 'ул. Навои', 'ул. Бабура', 'массив Кафолат', 'массив Богишамол', 'ул. Шота Руставели', 'ул. Фурката', 'массив Файзли', 'ул. Мукими', 'массив Чинобод'];

const OWNERS = [
  { first: 'Алишер', last: 'Каримов', phone: '+998901112233' },
  { first: 'Дилноза', last: 'Юсупова', phone: '+998901234567' },
  { first: 'Бекзод', last: 'Рахимов', phone: '+998935557788' },
  { first: 'Нигора', last: 'Саидова', phone: '+998977778899' },
  { first: 'Шахзод', last: 'Усмонов', phone: '+998901002030' },
];

// ───────────────────────────── UUID-схема ───────────────────────────────────
const pad12 = (n) => String(n).padStart(12, '0');
const OWNER_ID = (n) => `ca000000-0000-4000-8000-${pad12(n)}`;
const LISTING_ID = (i) => `ca100000-0000-4000-8000-${pad12(i)}`;
const TR_ID = (i, li) => `ca21${li}000-0000-4000-8000-${pad12(i)}`; // li: 0=RU 1=UZ 2=EN
const MEDIA_ID = (i, k) => `ca3${k}0000-0000-4000-8000-${pad12(i)}`; // k: 0..4

// ───────────────────────────── Генерация спеки ──────────────────────────────
const PT_CYCLE = ['APARTMENT', 'APARTMENT', 'APARTMENT', 'HOUSE', 'APARTMENT', 'COMMERCIAL', 'APARTMENT', 'LAND', 'APARTMENT', 'HOUSE'];
// «Новостройка» — вычисляемая категория (year_built за последние 3 года или в
// будущем — недострой), не PropertyType. Часть квартир сидируем новостройками.
const NOW_YEAR = new Date().getFullYear();
const NEW_CONSTRUCTION_MIN_YEAR = NOW_YEAR - 2;

function ptFor(i) {
  return PT_CYCLE[(i - 1) % PT_CYCLE.length];
}
function txFor(i, pt) {
  if (pt === 'LAND') return 'SALE';
  const r = i % 5;
  return r === 1 || r === 4 ? 'RENT' : 'SALE';
}
function statusFor(i) {
  if (i % 12 === 5) return 'NEW'; // в очередь модерации
  if (i % 19 === 9) return 'DRAFT'; // черновик владельца
  return 'ACTIVE';
}
function currencyFor(i, tx, pt) {
  if (pt === 'LAND') return 'UZS';
  if (tx === 'SALE' && i % 3 === 0) return 'USD';
  if (tx === 'RENT' && pt === 'APARTMENT' && i % 4 === 0) return 'USD';
  return 'UZS';
}
function dims(i, pt) {
  if (pt === 'LAND') {
    return { area: `${(4 + (i % 9)) * 100}.00`, rooms: null, floor: null, totalFloors: null, yearBuilt: null };
  }
  if (pt === 'COMMERCIAL') {
    return { area: `${60 + (i % 12) * 15}.00`, rooms: null, floor: 1, totalFloors: (i % 3) + 1, yearBuilt: 2008 + (i % 16) };
  }
  const rooms = pt === 'HOUSE' ? 4 + (i % 3) : 1 + (i % 4);
  const totalFloors = pt === 'HOUSE' ? 2 : 5 + (i % 12);
  const floor = pt === 'HOUSE' ? 1 : 1 + (i % totalFloors);
  const area = pt === 'HOUSE' ? `${120 + (i % 8) * 20}.00` : `${38 + (i % 7) * 9}.00`;
  // Каждая ~5-я квартира — новостройка: NOW_YEAR-2 … NOW_YEAR+2 (будущий год = недострой).
  const yearBuilt =
    pt === 'APARTMENT' && i % 5 === 2 ? NEW_CONSTRUCTION_MIN_YEAR + ((i >> 2) % 5) : 2005 + (i % 18);
  return { area, rooms, floor, totalFloors, yearBuilt };
}
function priceFor(i, tx, pt, cur) {
  const j = (i * 37) % 100;
  let base;
  if (tx === 'SALE') {
    if (cur === 'USD') {
      base = pt === 'HOUSE' ? 95000 + j * 900 : pt === 'COMMERCIAL' ? 130000 + j * 1500 : pt === 'LAND' ? 35000 + j * 400 : 58000 + j * 700;
    } else {
      base = pt === 'HOUSE' ? 950000000 + j * 9000000 : pt === 'COMMERCIAL' ? 1400000000 + j * 15000000 : pt === 'LAND' ? 280000000 + j * 4000000 : 640000000 + j * 7000000;
    }
  } else if (cur === 'USD') {
    base = pt === 'COMMERCIAL' ? 900 + j * 30 : 350 + j * 9;
  } else {
    base = pt === 'COMMERCIAL' ? 9000000 + j * 250000 : pt === 'HOUSE' ? 7000000 + j * 120000 : 2800000 + j * 55000;
  }
  return `${base}.00`;
}

function titles(pt, d, rooms, area, zhk, isNewConstruction) {
  const sot = parseFloat(area) / 100;
  const m2 = parseFloat(area);
  if (pt === 'LAND') {
    return {
      RU: `Участок ${sot} сот. в ${d.nameRu}`,
      UZ: `${d.nameUz}da ${sot} sotix yer uchastkasi`,
      EN: `${sot} sotka land plot in ${d.nameEn}`,
    };
  }
  if (pt === 'COMMERCIAL') {
    return {
      RU: `Коммерческое помещение ${m2} м² в ${d.nameRu}`,
      UZ: `${d.nameUz}da ${m2} m² tijorat binosi`,
      EN: `${m2} m² commercial space in ${d.nameEn}`,
    };
  }
  if (pt === 'APARTMENT' && isNewConstruction) {
    return {
      RU: `${rooms}-комн. квартира в ЖК «${zhk}», ${d.nameRu}`,
      UZ: `${d.nameUz}, «${zhk}» TJM, ${rooms} xonali kvartira`,
      EN: `${rooms}-room apartment in ${zhk}, ${d.nameEn}`,
    };
  }
  const tw = TYPE_W[pt];
  return {
    RU: `${rooms}-комн. ${tw.ru} в ${d.nameRu}`,
    UZ: `${d.nameUz}da ${rooms} xonali ${tw.uz}`,
    EN: `${rooms}-room ${tw.en} in ${d.nameEn}`,
  };
}

// Лайфстайл-описания БЕЗ структурных полей (комнаты/м²/этаж/год показываются из
// полей объявления — не дублируем, баглист мобилки #6). Вариант — по i (детерминизм).
function descs(i, pt, tx, d) {
  const ru = tx === 'RENT' ? 'Сдаётся в аренду' : 'Продаётся';
  const uz = tx === 'RENT' ? 'Ijaraga beriladi' : 'Sotiladi';
  const en = tx === 'RENT' ? 'For rent' : 'For sale';
  if (pt === 'LAND') {
    const v = [
      {
        RU: `${ru}. Ровный участок правильной формы в районе ${d.nameRu}. Коммуникации рядом, круглогодичный подъезд, тихое окружение — подойдёт и под строительство, и как вложение.`,
        UZ: `${uz}. ${d.nameUz} tumanida tekis, to'g'ri shaklli uchastka. Kommunikatsiyalar yaqin, yil davomida qulay yo'l, tinch atrof-muhit.`,
        EN: `${en}. Level, regular-shaped plot in ${d.nameEn}. Utilities nearby, year-round access, quiet surroundings — great for building or investment.`,
      },
      {
        RU: `${ru}. Участок в развивающейся части ${d.nameRu}: асфальтированный подъезд, электричество и вода по границе. Документы готовы к сделке.`,
        UZ: `${uz}. ${d.nameUz}ning rivojlanayotgan qismida uchastka: asfalt yo'l, elektr va suv chegarada. Hujjatlar bitimga tayyor.`,
        EN: `${en}. Plot in a growing part of ${d.nameEn}: paved access, power and water at the boundary. Paperwork ready.`,
      },
      {
        RU: `${ru}. Тихий участок недалеко от основных магистралей ${d.nameRu}. Хорошие соседи, перспективная локация, разумный торг возможен.`,
        UZ: `${uz}. ${d.nameUz} asosiy yo'llariga yaqin tinch uchastka. Yaxshi qo'shnilar, istiqbolli joylashuv, kelishish mumkin.`,
        EN: `${en}. Quiet plot near the main roads of ${d.nameEn}. Good neighbours, promising location, price negotiable.`,
      },
    ];
    return v[i % v.length];
  }
  if (pt === 'COMMERCIAL') {
    const v = [
      {
        RU: `${ru}. Помещение с отдельным входом и витринными окнами в проходной части ${d.nameRu}. Подходит под магазин, офис или сферу услуг.`,
        UZ: `${uz}. ${d.nameUz}ning gavjum qismida alohida kirish va vitrina oynalariga ega bino. Do'kon, ofis yoki xizmat ko'rsatish uchun mos.`,
        EN: `${en}. Unit with a separate entrance and display windows in a busy part of ${d.nameEn}. Suits retail, office or services.`,
      },
      {
        RU: `${ru}. Готовое к работе помещение: свежий ремонт, все коммуникации, парковка для клиентов. Первая линия, ${d.nameRu}.`,
        UZ: `${uz}. Ishga tayyor bino: yangi ta'mir, barcha kommunikatsiyalar, mijozlar uchun avtoturargoh. Birinchi qator, ${d.nameUz}.`,
        EN: `${en}. Move-in-ready unit: fresh renovation, all utilities, customer parking. Street-front location in ${d.nameEn}.`,
      },
      {
        RU: `${ru}. Ликвидное помещение в ${d.nameRu} с высоким пешеходным трафиком. Гибкая планировка, возможно расширение на соседние площади.`,
        UZ: `${uz}. ${d.nameUz}da piyodalar oqimi yuqori bo'lgan likvidli bino. Moslashuvchan rejalashtirish, kengaytirish imkoniyati bor.`,
        EN: `${en}. High-footfall unit in ${d.nameEn}. Flexible layout, adjacent space available for expansion.`,
      },
    ];
    return v[i % v.length];
  }
  const tw = TYPE_W[pt] || { ru: 'квартира', uz: 'kvartira', en: 'apartment' };
  const v = [
    {
      RU: `${ru}. Светлая ${tw.ru} с продуманной планировкой в ${d.nameRu}. Во дворе детская площадка; школа, детский сад и магазины — в пешей доступности.`,
      UZ: `${uz}. ${d.nameUz}da yorug', qulay rejalashtirilgan ${tw.uz}. Hovlida bolalar maydonchasi; maktab, bog'cha va do'konlar piyoda yetib boriladigan masofada.`,
      EN: `${en}. Bright ${tw.en} with a practical layout in ${d.nameEn}. Playground in the courtyard; school, kindergarten and shops within walking distance.`,
    },
    {
      RU: `${ru}. Качественный ремонт, тёплый и тихий двор, приветливые соседи. Удобный выезд на основные магистрали ${d.nameRu}, остановки транспорта рядом.`,
      UZ: `${uz}. Sifatli ta'mir, issiq va tinch hovli, yaxshi qo'shnilar. ${d.nameUz} asosiy yo'llariga qulay chiqish, bekatlar yaqin.`,
      EN: `${en}. Quality renovation, warm and quiet courtyard, friendly neighbours. Easy access to the main roads of ${d.nameEn}, transit stops nearby.`,
    },
    {
      RU: `${ru}. Развитая инфраструктура ${d.nameRu}: рынки, парки и поликлиника в нескольких минутах. Отличный вариант и для жизни, и под сдачу.`,
      UZ: `${uz}. ${d.nameUz}ning rivojlangan infratuzilmasi: bozorlar, parklar va poliklinika bir necha daqiqada. Yashash uchun ham, ijaraga berish uchun ham ajoyib variant.`,
      EN: `${en}. Well-developed ${d.nameEn} infrastructure: markets, parks and a clinic minutes away. Great both to live in and to rent out.`,
    },
  ];
  return v[i % v.length];
}

const MEDIA_PLAN = {
  APARTMENT: ['building', 'living', 'kitchen', 'bedroom', 'bathroom'],
  HOUSE: ['house', 'garden', 'living', 'kitchen', 'bedroom'],
  COMMERCIAL: ['office', 'retail', 'building', 'living'],
  LAND: ['land', 'land', 'building'],
};

function photosFor(i, pt) {
  const plan = MEDIA_PLAN[pt];
  const count = Math.min(plan.length, 3 + (i % 3)); // 3..5, но не больше плана
  const cats = plan.slice(0, count);
  let landN = 0;
  return cats.map((cat, idx) => {
    const arr = poolKeys[cat];
    if (cat === 'land') {
      const pick = arr[landN % arr.length];
      landN += 1;
      return pick;
    }
    return arr[(i + idx) % arr.length];
  });
}

// ───────────────────────────── Upserts ──────────────────────────────────────
async function upsertOwners() {
  for (let n = 1; n <= OWNERS.length; n += 1) {
    const o = OWNERS[n - 1];
    const id = OWNER_ID(n);
    const display = `${o.first} ${o.last}`;
    // Телефон только на профиле (contact_phone) — его и показывает контакт-карточка
    // (profile.contactPhone ?? owner.phone). У User.phone partial-unique индекс, а
    // он для логина не нужен → не трогаем, чтобы не ловить коллизии на стенде.
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email: `catalog-owner${n}@demo.avino.uz`,
        isEmailVerified: true,
        status: 'ACTIVE',
        defaultLanguage: 'RU',
      },
    });
    await prisma.userProfile.upsert({
      where: { userId: id },
      update: { firstName: o.first, lastName: o.last, displayName: display, contactPhone: o.phone },
      create: {
        userId: id,
        firstName: o.first,
        lastName: o.last,
        displayName: display,
        contactPhone: o.phone,
        preferredLanguage: 'RU',
      },
    });
  }
}

async function upsertListing(i, districts, now) {
  const pt = ptFor(i);
  const tx = txFor(i, pt);
  const status = statusFor(i);
  const cur = currencyFor(i, tx, pt);
  const dim = dims(i, pt);
  const price = priceFor(i, tx, pt, cur);
  const d = districts[(i - 1) % districts.length];
  const [clat, clng] = CENTER[d.code] || TASHKENT;
  // детерминированный джиттер вокруг центра района (~±500 м)
  const latitude = (clat + (((i * 7) % 11) - 5) * 0.0009).toFixed(6);
  const longitude = (clng + (((i * 5) % 11) - 5) * 0.0011).toFixed(6);
  const zhk = ZHK[i % ZHK.length];
  const street = STREETS[i % STREETS.length];
  const address = `Ташкент, ${d.nameRu}, ${street}, ${(i % 80) + 1}`;
  const publishedAt = status === 'ACTIVE' ? new Date(now - i * 3600 * 1000) : null;
  const ownerId = OWNER_ID(((i - 1) % OWNERS.length) + 1);
  const id = LISTING_ID(i);

  await prisma.listing.upsert({
    where: { id },
    update: { status, price, currency: cur, districtId: d.id, latitude, longitude, publishedAt },
    create: {
      id,
      ownerId,
      originalLanguage: 'RU',
      transactionType: tx,
      propertyType: pt,
      status,
      price,
      currency: cur,
      area: dim.area,
      rooms: dim.rooms,
      floor: dim.floor,
      totalFloors: dim.totalFloors,
      yearBuilt: dim.yearBuilt,
      address,
      districtId: d.id,
      latitude,
      longitude,
      publishedAt,
    },
  });

  const t = titles(
    pt, d, dim.rooms, dim.area, zhk,
    dim.yearBuilt != null && dim.yearBuilt >= NEW_CONSTRUCTION_MIN_YEAR,
  );
  const ds = descs(i, pt, tx, d);
  const LANGS = [['RU', 0], ['UZ', 1], ['EN', 2]];
  for (const [lang, li] of LANGS) {
    await prisma.listingTranslation.upsert({
      where: { id: TR_ID(i, li) },
      update: { title: t[lang], description: ds[lang] },
      create: {
        id: TR_ID(i, li),
        listingId: id,
        language: lang,
        title: t[lang],
        description: ds[lang],
        source: 'USER',
      },
    });
  }

  const photos = photosFor(i, pt);
  for (let k = 0; k < photos.length; k += 1) {
    const ph = photos[k];
    await prisma.listingMedia.upsert({
      where: { id: MEDIA_ID(i, k) },
      update: { url: ph.url, storageKey: ph.key, thumbnailUrl: ph.url, sortOrder: k },
      create: {
        id: MEDIA_ID(i, k),
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
  return { pt, tx, status, cur };
}

// ───────────────────────────── main ─────────────────────────────────────────
async function main() {
  preflight();
  console.log(`seed-catalog: N=${N}, bucket=${S3.bucket}, endpoint=${S3.endpoint || '(aws default)'}`);

  await ensurePool();
  await upsertOwners();

  const districts = await prisma.district.findMany({
    select: { id: true, code: true, nameRu: true, nameUz: true, nameEn: true },
    orderBy: { code: 'asc' },
  });
  if (!districts.length) {
    console.error('seed-catalog: таблица districts пуста — прогони миграции/сид районов сначала.');
    process.exit(1);
  }

  const now = Date.now();
  const tally = {};
  for (let i = 1; i <= N; i += 1) {
    const r = await upsertListing(i, districts, now);
    const k = `${r.status}/${r.tx}/${r.pt}`;
    tally[k] = (tally[k] || 0) + 1;
  }

  const active = await prisma.listing.count({ where: { status: 'ACTIVE' } });
  const total = await prisma.listing.count();
  const media = await prisma.listingMedia.count();
  console.log('распределение (status/tx/type):');
  for (const k of Object.keys(tally).sort()) console.log(`  ${k}: ${tally[k]}`);
  console.log(`seed-catalog: ok — добавлено/обновлено ${N}; ACTIVE всего = ${active}, listings всего = ${total}, media всего = ${media}`);
}

main()
  .catch((e) => {
    console.error('seed-catalog failed:', e && e.message ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
