/**
 * seed-all.cjs — КОМПЛЕКСНЫЙ генератор каталога для ТЕСТ-СТЕНДА (staging).
 *
 * Наполняет каталог демо-объявлениями ПО ВСЕМ 14 РЕГИОНАМ (не только Ташкент) и
 * заполняет ВСЕ новые поля, чтобы вживую проверить весь свежий функционал:
 *   • Zillow-фильтры Фазы 2 — bathrooms / parkingType / lotArea / amenities;
 *   • каскад Регион → Район и фильтр region_id (ADR-0113);
 *   • карту /search и полигон-поиск (ST_Within) — пины ложатся в свой регион;
 *   • гистограмму цен (микс USD/UZS, разброс цен);
 *   • компактный бейдж «времени на сайте» (DaysBadge) — РАЗБРОС createdAt от
 *     «Новое» (<24ч) до нескольких лет;
 *   • промо TOP/VIP, очередь модерации (NEW/DRAFT), приём туров.
 *
 * Не заменяет seed-catalog.cjs / seed-regions.cjs — это отдельный самодостаточный
 * скрипт со своим UUID-префиксом (5a…). Идемпотентен: фиксированные UUID + upsert,
 * повторный запуск не плодит дубли и сохраняет тот же возраст карточек.
 *
 * Фото РЕАЛЬНО скачиваются (loremflickr → picsum fallback) и аплоадятся в R2, в
 * listing_media пишется storage_key — иначе sign-on-read (ADR-0086) превратил бы
 * внешний URL в несуществующий R2-ключ → presigned 404 → заглушка «AVINO».
 * Пул идемпотентен (HeadObject → skip). Без S3 скрипт падает на preflight.
 *
 * Запуск на стенде (предварительно: prisma migrate deploy):
 *   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
 *     -f docker-compose.staging.yml exec -T \
 *     -e SEED_PER_REGION=4 -e SEED_TASHKENT=20 api node < apps/api/prisma/seed-all.cjs
 *
 * Локально (api из docker-compose.yml):
 *   docker compose exec -T api node < apps/api/prisma/seed-all.cjs
 *
 * Требования на стенде: у api заданы S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/
 * S3_SECRET_ACCESS_KEY и есть исходящий интернет; накатаны миграции regions/
 * districts + bathrooms/parking_type/lot_area/amenities.
 */

const { PrismaClient } = require('@prisma/client');
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');

const prisma = new PrismaClient();

const PER_REGION = Math.max(1, parseInt(process.env.SEED_PER_REGION || '4', 10));
const TASHKENT_N = Math.max(1, parseInt(process.env.SEED_TASHKENT || '20', 10));
const TASHKENT_CITY_CODE = 'toshkent-shahri';

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
      `seed-all: S3/R2 не сконфигурирован (${missing.join(', ')}). ` +
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

/** Стабильный URL для listing_media.url (без подписи); extractKey(url) round-trip'ит ключ. */
function objectUrl(key) {
  if (S3.publicBaseUrl) return `${S3.publicBaseUrl}/${key}`;
  const base = (S3.endpoint || '').replace(/\/+$/, '');
  return `${base}/${S3.bucket}/${key}`;
}

// ───────────────────────────── Пул картинок ─────────────────────────────────
// Тематические фото по категориям комнат. lock делает кадр детерминированным.
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
    `https://picsum.photos/seed/avino-all-${lock}/1024/768`,
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
      const key = `seed/catalog/${p.cat}-${i + 1}.jpg`; // тот же пул, что у seed-catalog
      poolKeys[p.cat].push({ key, url: objectUrl(key) });
      if (await exists(key)) continue;
      const lock = 1000 + pi * 50 + i;
      const buf = await fetchImage(p.q, lock);
      await s3client().send(
        new PutObjectCommand({ Bucket: S3.bucket, Key: key, Body: buf, ContentType: 'image/jpeg' }),
      );
      uploaded += 1;
      console.log(`  ↑ R2 ${key} (${buf.length} b)`);
    }
    pi += 1;
  }
  console.log(`пул фото: ${uploaded} новых, остальные уже были в R2.`);
}

// ───────────────────────────── Справочники ──────────────────────────────────
// Центры районов Ташкента (по district.code). Применяются только для региона
// toshkent-shahri; для остальных — центр области (REGION_CENTER).
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

// Приблизительные центры областей (по region.code) — чтобы пины ложились в свой
// регион, а карта /search автоподгонялась под bounds.
const REGION_CENTER = {
  andijon: [40.78, 72.34],
  buxoro: [39.77, 64.42],
  'toshkent-shahri': [41.31, 69.28],
  jizzax: [40.12, 67.84],
  qashqadaryo: [38.86, 65.79],
  navoiy: [40.1, 65.38],
  namangan: [41.0, 71.67],
  qoraqalpogiston: [42.46, 59.61],
  samarqand: [39.65, 66.96],
  surxondaryo: [38.07, 67.27],
  sirdaryo: [40.49, 68.78],
  toshkent: [41.0, 69.6],
  fargona: [40.39, 71.78],
  xorazm: [41.55, 60.63],
};
const FALLBACK_CENTER = [41.3111, 69.2797]; // Ташкент

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

// ───────────────────────────── UUID-схема (префикс 5a) ───────────────────────
const pad12 = (n) => String(n).padStart(12, '0');
const OWNER_ID = (n) => `5a000000-0000-4000-8000-${pad12(n)}`;
const LISTING_ID = (g) => `5a100000-0000-4000-8000-${pad12(g)}`;
const TR_ID = (g, li) => `5a21${li}000-0000-4000-8000-${pad12(g)}`; // li: 0=RU 1=UZ 2=EN
const MEDIA_ID = (g, k) => `5a3${k}0000-0000-4000-8000-${pad12(g)}`; // k: 0..4

// ───────────────────────────── Генерация спеки ──────────────────────────────
const PT_CYCLE = ['APARTMENT', 'APARTMENT', 'NEW_BUILDING', 'HOUSE', 'APARTMENT', 'COMMERCIAL', 'APARTMENT', 'LAND', 'NEW_BUILDING', 'HOUSE'];
const PARKING = ['YARD', 'COVERED', 'GARAGE', 'UNDERGROUND'];
const AMENITIES = ['AIR_CONDITIONING', 'FURNITURE', 'APPLIANCES', 'INTERNET', 'ELEVATOR', 'BALCONY', 'HEATING', 'SECURITY'];
// Возраст карточки в днях (дробное < 1 → «Новое»). Цикл покрывает все ветки
// DaysBadge: <24ч / дни / недели / месяцы / годы.
const AGE_DAYS_CYCLE = [0.08, 0.5, 1, 3, 7, 12, 18, 26, 45, 80, 150, 300, 600, 1000];

const ptFor = (g) => PT_CYCLE[(g - 1) % PT_CYCLE.length];

function txFor(g, pt) {
  if (pt === 'LAND' || pt === 'NEW_BUILDING') return 'SALE';
  const r = g % 5;
  return r === 1 || r === 4 ? 'RENT' : 'SALE';
}

function statusFor(g) {
  if (g % 14 === 5) return 'NEW'; // очередь модерации
  if (g % 23 === 9) return 'DRAFT'; // черновик владельца
  return 'ACTIVE';
}

function currencyFor(g, tx, pt) {
  if (pt === 'LAND') return 'UZS';
  if (tx === 'SALE' && (pt === 'NEW_BUILDING' || g % 3 === 0)) return 'USD';
  if (tx === 'RENT' && pt === 'APARTMENT' && g % 4 === 0) return 'USD';
  return 'UZS';
}

function dims(g, pt) {
  if (pt === 'LAND') {
    return { area: `${(4 + (g % 9)) * 100}.00`, rooms: null, floor: null, totalFloors: null, yearBuilt: null };
  }
  if (pt === 'COMMERCIAL') {
    return { area: `${60 + (g % 12) * 15}.00`, rooms: null, floor: 1, totalFloors: (g % 3) + 1, yearBuilt: 2008 + (g % 16) };
  }
  const rooms = pt === 'HOUSE' ? 4 + (g % 3) : 1 + (g % 4);
  const totalFloors = pt === 'HOUSE' ? 2 : 5 + (g % 12);
  const floor = pt === 'HOUSE' ? 1 : 1 + (g % totalFloors);
  const area = pt === 'HOUSE' ? `${120 + (g % 8) * 20}.00` : `${38 + (g % 7) * 9}.00`;
  const yearBuilt = pt === 'NEW_BUILDING' ? 2023 + (g % 4) : 2005 + (g % 18);
  return { area, rooms, floor, totalFloors, yearBuilt };
}

function bathroomsFor(g, pt) {
  if (pt === 'LAND') return null;
  if (pt === 'HOUSE') return 2 + (g % 3); // 2..4
  if (pt === 'COMMERCIAL') return 1 + (g % 2); // 1..2
  return 1 + (g % 3); // квартира/новостройка: 1..3
}

function parkingFor(g, pt) {
  if (pt === 'LAND') return null;
  if (g % 7 === 0) return null; // часть без парковки — проверить «не задано»
  return PARKING[g % PARKING.length];
}

function amenitiesFor(g, pt) {
  if (pt === 'LAND') return [];
  const k = 2 + (g % 4); // 2..5 удобств
  const out = [];
  for (let x = 0; x < k; x += 1) {
    const a = AMENITIES[(g + x) % AMENITIES.length];
    if (a === 'ELEVATOR' && pt === 'HOUSE') continue; // в доме лифта нет
    if (!out.includes(a)) out.push(a);
  }
  // Бассейн — только не-квартиры (мобилка #5): часть домов для демо фильтра POOL.
  if (pt === 'HOUSE' && g % 3 === 0 && !out.includes('POOL')) out.push('POOL');
  return out;
}

function lotAreaFor(g, pt, areaM2) {
  if (pt === 'LAND') return (parseFloat(areaM2) / 100).toFixed(2); // соток = м²/100
  if (pt === 'HOUSE') return `${4 + (g % 9)}.00`; // 4..12 соток
  return null;
}

function priceFor(g, tx, pt, cur) {
  const j = (g * 37) % 100;
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

function promoFor(g, status) {
  if (status !== 'ACTIVE') return 'NORMAL';
  if (g % 9 === 3) return 'VIP';
  if (g % 5 === 2) return 'TOP';
  return 'NORMAL';
}

const TOUR_WINDOWS = [
  { start: '10:00', end: '13:00' },
  { start: '15:00', end: '18:00' },
];

function titles(pt, d, rooms, area, zhk) {
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
  if (pt === 'NEW_BUILDING') {
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
// полей объявления — не дублируем, баглист мобилки #6). Вариант — по g (детерминизм).
function descs(g, pt, tx, d) {
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
    return v[g % v.length];
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
    return v[g % v.length];
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
  return v[g % v.length];
}

const MEDIA_PLAN = {
  APARTMENT: ['building', 'living', 'kitchen', 'bedroom', 'bathroom'],
  NEW_BUILDING: ['building', 'living', 'kitchen', 'bedroom', 'bathroom'],
  HOUSE: ['house', 'garden', 'living', 'kitchen', 'bedroom'],
  COMMERCIAL: ['office', 'retail', 'building', 'living'],
  LAND: ['land', 'land', 'building'],
};

function photosFor(g, pt) {
  const plan = MEDIA_PLAN[pt];
  const count = Math.min(plan.length, 3 + (g % 3)); // 3..5, но не больше плана
  const cats = plan.slice(0, count);
  let landN = 0;
  return cats.map((cat, idx) => {
    const arr = poolKeys[cat];
    if (cat === 'land') {
      const pick = arr[landN % arr.length];
      landN += 1;
      return pick;
    }
    return arr[(g + idx) % arr.length];
  });
}

// ───────────────────────────── Upserts ──────────────────────────────────────
async function upsertOwners() {
  for (let n = 1; n <= OWNERS.length; n += 1) {
    const o = OWNERS[n - 1];
    const id = OWNER_ID(n);
    const display = `${o.first} ${o.last}`;
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email: `seed-all-owner${n}@demo.avino.uz`,
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

async function upsertListing(g, region, district, now) {
  const pt = ptFor(g);
  const tx = txFor(g, pt);
  const status = statusFor(g);
  const cur = currencyFor(g, tx, pt);
  const dim = dims(g, pt);
  const price = priceFor(g, tx, pt, cur);
  const bathrooms = bathroomsFor(g, pt);
  const parkingType = parkingFor(g, pt);
  const amenities = amenitiesFor(g, pt);
  const lotArea = lotAreaFor(g, pt, dim.area);
  const promotionType = promoFor(g, status);

  // Координаты: для Ташкента-города — центр района (если код известен), иначе
  // центр области. Детерминированный джиттер вокруг центра (~±500 м).
  let center;
  if (region.code === TASHKENT_CITY_CODE && CENTER[district.code]) {
    center = CENTER[district.code];
  } else {
    center = REGION_CENTER[region.code] || FALLBACK_CENTER;
  }
  const [clat, clng] = center;
  const latitude = (clat + (((g * 7) % 11) - 5) * 0.0009).toFixed(6);
  const longitude = (clng + (((g * 5) % 11) - 5) * 0.0011).toFixed(6);

  const zhk = ZHK[g % ZHK.length];
  const street = STREETS[g % STREETS.length];
  const address = `${region.nameRu}, ${district.nameRu}, ${street}, ${(g % 80) + 1}`;

  // Возраст карточки → createdAt (для DaysBadge); publishedAt = createdAt у ACTIVE.
  const ageDays = AGE_DAYS_CYCLE[(g - 1) % AGE_DAYS_CYCLE.length];
  const createdAt = new Date(now - Math.round(ageDays * 86_400_000));
  const publishedAt = status === 'ACTIVE' ? createdAt : null;

  const promotionStartedAt = promotionType !== 'NORMAL' ? new Date(now - 86_400_000) : null;
  const promotionExpiresAt = promotionType !== 'NORMAL' ? new Date(now + 30 * 86_400_000) : null;
  const toursEnabled = status === 'ACTIVE' && g % 3 === 0;
  const tourWindows = toursEnabled ? TOUR_WINDOWS : [];

  const ownerId = OWNER_ID(((g - 1) % OWNERS.length) + 1);
  const id = LISTING_ID(g);

  const dynamic = {
    status,
    price,
    currency: cur,
    bathrooms,
    parkingType,
    amenities: { set: amenities }, // скалярный enum-массив: форма { set } валидна и в create, и в update
    lotArea,
    districtId: district.id,
    latitude,
    longitude,
    address,
    createdAt,
    publishedAt,
    promotionType,
    promotionStartedAt,
    promotionExpiresAt,
    toursEnabled,
    tourWindows,
  };

  await prisma.listing.upsert({
    where: { id },
    update: dynamic,
    create: {
      id,
      ownerId,
      originalLanguage: 'RU',
      transactionType: tx,
      propertyType: pt,
      area: dim.area,
      rooms: dim.rooms,
      floor: dim.floor,
      totalFloors: dim.totalFloors,
      yearBuilt: dim.yearBuilt,
      ...dynamic,
    },
  });

  const t = titles(pt, district, dim.rooms, dim.area, zhk);
  const ds = descs(g, pt, tx, district);
  const LANGS = [['RU', 0], ['UZ', 1], ['EN', 2]];
  for (const [lang, li] of LANGS) {
    await prisma.listingTranslation.upsert({
      where: { id: TR_ID(g, li) },
      update: { title: t[lang], description: ds[lang] },
      create: {
        id: TR_ID(g, li),
        listingId: id,
        language: lang,
        title: t[lang],
        description: ds[lang],
        source: 'USER',
      },
    });
  }

  const photos = photosFor(g, pt);
  for (let k = 0; k < photos.length; k += 1) {
    const ph = photos[k];
    await prisma.listingMedia.upsert({
      where: { id: MEDIA_ID(g, k) },
      update: { url: ph.url, storageKey: ph.key, thumbnailUrl: ph.url, sortOrder: k },
      create: {
        id: MEDIA_ID(g, k),
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
  return { pt, tx, status, cur, promotionType };
}

// ───────────────────────────── main ─────────────────────────────────────────
async function main() {
  preflight();
  console.log(
    `seed-all: per_region=${PER_REGION}, tashkent=${TASHKENT_N}, bucket=${S3.bucket}, ` +
      `endpoint=${S3.endpoint || '(aws default)'}`,
  );

  await ensurePool();
  await upsertOwners();

  const regions = await prisma.region.findMany({ orderBy: { sortOrder: 'asc' } });
  if (!regions.length) {
    console.error('seed-all: таблица regions пуста — накати миграции (prisma migrate deploy) сначала.');
    process.exit(1);
  }

  const now = Date.now();
  const tally = {};
  const perRegion = [];
  let g = 0;
  let created = 0;

  for (const region of regions) {
    const count = region.code === TASHKENT_CITY_CODE ? TASHKENT_N : PER_REGION;
    const districts = await prisma.district.findMany({
      where: { regionId: region.id },
      orderBy: { nameRu: 'asc' },
      take: count, // до count разных районов; если меньше — крутим по кругу ниже
    });
    if (!districts.length) {
      perRegion.push(`${region.nameRu}: 0 районов — пропуск`);
      continue;
    }
    for (let j = 0; j < count; j += 1) {
      g += 1;
      const district = districts[j % districts.length];
      const r = await upsertListing(g, region, district, now);
      const key = `${r.status}/${r.tx}/${r.pt}`;
      tally[key] = (tally[key] || 0) + 1;
      created += 1;
    }
    perRegion.push(`${region.nameRu}: +${count}`);
  }

  const active = await prisma.listing.count({ where: { status: 'ACTIVE' } });
  const total = await prisma.listing.count();
  const media = await prisma.listingMedia.count();
  console.log('распределение (status/tx/type):');
  for (const k of Object.keys(tally).sort()) console.log(`  ${k}: ${tally[k]}`);
  console.log('по регионам:');
  perRegion.forEach((s) => console.log(`  • ${s}`));
  console.log(
    `seed-all: ok — создано/обновлено ${created}; ACTIVE всего = ${active}, ` +
      `listings всего = ${total}, media всего = ${media}`,
  );
}

main()
  .catch((e) => {
    console.error('seed-all failed:', e && e.message ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
