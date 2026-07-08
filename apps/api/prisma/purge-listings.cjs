/**
 * purge-listings.cjs — полная очистка КАТАЛОГА на ТЕСТ-СТЕНДЕ (staging).
 *
 * Удаляет ВСЕ объявления и всё, что к ним привязано, чтобы засеять каталог
 * заново с новыми параметрами. Пользователи, роли, настройки (app_settings),
 * регионы/районы, сохранённые поиски и журналы аудита — НЕ трогаются.
 *
 * Как это работает: в схеме ВСЕ внешние ключи на listings объявлены
 * `onDelete: Cascade` (translations, media, promotions, promotion_logs,
 * moderation_logs, favorites, chat_threads → chat_messages, complaints,
 * tour_requests). Поэтому достаточно ОДНОГО `DELETE FROM listings` — Postgres
 * сам снесёт всех потомков на уровне FK. Здесь это `prisma.listing.deleteMany`.
 *
 * ⚠️  ОРФАНЫ R2: файлы в Cloudflare R2 этот скрипт НЕ удаляет — они останутся
 *     как orphan-объекты (storage_key из listing_media). Это безвредно (новый
 *     seed грузит свои ключи), периодический воркер чистки orphan R2 (#211)
 *     уберёт их. Чтобы снести и файлы — запусти с PURGE_R2=yes (нужны S3_* env).
 *
 * ⚠️  ПРЕДОХРАНИТЕЛЬ: без CONFIRM_PURGE=yes скрипт только покажет, что будет
 *     удалено, и выйдет, ничего не трогая (dry-run).
 *
 *   # staging — показать, что удалится (dry-run, безопасно):
 *   docker compose -f docker-compose.staging.yml exec -T api \
 *     node < apps/api/prisma/purge-listings.cjs
 *
 *   # staging — реально удалить:
 *   docker compose -f docker-compose.staging.yml exec -T -e CONFIRM_PURGE=yes \
 *     api node < apps/api/prisma/purge-listings.cjs
 *
 *   # staging — удалить И почистить файлы в R2:
 *   docker compose -f docker-compose.staging.yml exec -T \
 *     -e CONFIRM_PURGE=yes -e PURGE_R2=yes \
 *     api node < apps/api/prisma/purge-listings.cjs
 *
 *   # локально — то же без -f docker-compose.staging.yml.
 *
 * Всё берётся из process.env контейнера (DATABASE_URL + S3_*), поэтому
 * одинаково работает локально и на стенде.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CONFIRM = process.env.CONFIRM_PURGE === 'yes';
const PURGE_R2 = process.env.PURGE_R2 === 'yes';

// Потомки listings (camelCase-делегаты Prisma) для отчёта до/после.
// Все привязаны к listing через FK onDelete: Cascade — снесутся автоматически.
const CHILD_MODELS = [
  ['listingTranslation', 'переводы'],
  ['listingMedia', 'медиа (R2-объекты)'],
  ['listingPromotion', 'продвижения'],
  ['promotionLog', 'логи промо'],
  ['moderationLog', 'логи модерации'],
  ['favorite', 'избранное'],
  ['chatThread', 'чат-треды'],
  ['chatMessage', 'сообщения чата'],
  ['complaint', 'жалобы'],
  ['tourRequest', 'заявки на просмотр'],
];

async function counts() {
  const listings = await prisma.listing.count();
  const children = {};
  for (const [model] of CHILD_MODELS) {
    children[model] = await prisma[model].count();
  }
  return { listings, children };
}

function printReport({ listings, children }) {
  console.log(`  listings .......................... ${listings}`);
  for (const [model, label] of CHILD_MODELS) {
    console.log(`  ${label.padEnd(28, '.')}.. ${children[model]}`);
  }
}

async function purgeR2(storageKeys) {
  if (storageKeys.length === 0) {
    console.log('R2: нет storage_key для удаления.');
    return;
  }
  const {
    S3Client,
    DeleteObjectsCommand,
  } = require('@aws-sdk/client-s3');

  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) {
    console.warn('R2: S3_ENDPOINT/S3_BUCKET не заданы — пропускаю чистку файлов.');
    return;
  }
  const s3 = new S3Client({
    endpoint,
    region: process.env.S3_REGION || 'auto',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });

  // DeleteObjects — максимум 1000 ключей за запрос.
  let removed = 0;
  for (let i = 0; i < storageKeys.length; i += 1000) {
    const batch = storageKeys.slice(i, i + 1000);
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    removed += batch.length - (res.Errors?.length || 0);
    if (res.Errors?.length) {
      console.warn(`R2: ${res.Errors.length} ошибок в батче`, res.Errors.slice(0, 3));
    }
  }
  console.log(`R2: удалено объектов ~${removed} из ${storageKeys.length}.`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' PURGE LISTINGS — очистка каталога staging');
  console.log('═══════════════════════════════════════════════════════════\n');

  const before = await counts();
  console.log('Текущее состояние (будет удалено):');
  printReport(before);
  console.log('');

  if (before.listings === 0) {
    console.log('✓ Объявлений нет — чистить нечего. Выход.');
    return;
  }

  if (!CONFIRM) {
    console.log('⏸  DRY-RUN: CONFIRM_PURGE != "yes" — ничего не удалено.');
    console.log('   Чтобы реально удалить, перезапусти с  -e CONFIRM_PURGE=yes');
    return;
  }

  // Если просили чистку R2 — собрать ключи ДО удаления строк.
  let storageKeys = [];
  if (PURGE_R2) {
    const media = await prisma.listingMedia.findMany({
      where: { storageKey: { not: null } },
      select: { storageKey: true },
    });
    storageKeys = media.map((m) => m.storageKey);
    console.log(`R2: собрано ${storageKeys.length} storage_key для удаления.\n`);
  }

  console.log('Удаляю все объявления (каскад снесёт потомков)…');
  const { count } = await prisma.listing.deleteMany({});
  console.log(`✓ Удалено объявлений: ${count}\n`);

  if (PURGE_R2) {
    await purgeR2(storageKeys);
    console.log('');
  }

  const after = await counts();
  console.log('Состояние после очистки:');
  printReport(after);
  console.log('');

  const leftover =
    after.listings +
    CHILD_MODELS.reduce((sum, [m]) => sum + after.children[m], 0);
  if (leftover === 0) {
    console.log('✓ Каталог пуст. Можно засеивать заново (seed-all.cjs / seed-catalog.cjs).');
  } else {
    console.warn(`⚠️  Осталось ${leftover} строк-потомков — проверь каскад/FK.`);
  }
}

main()
  .catch((e) => {
    console.error('✗ Ошибка очистки:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
