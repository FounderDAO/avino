/**
 * Throwaway R2 connectivity smoke (можно удалить после проверки).
 * Читает root .env, повторяет путь UploadsService: PutObject → GetObject →
 * presigned GET (как в публичном/приватном чтении) → DeleteObject.
 * Секреты НЕ печатает. Запуск: node apps/api/r2-smoke.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// --- читаем root .env (мини-парсер, без зависимости от dotenv) ---
const envPath = path.resolve(__dirname, '../../.env');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].replace(/\s+#.*$/, '').trim(); // срезаем inline-комментарий
}

const endpoint = env.S3_ENDPOINT || undefined;
const bucket = env.S3_BUCKET;
const region = env.S3_REGION || 'us-east-1';
const forcePathStyle = env.S3_FORCE_PATH_STYLE !== 'false';
const publicBase = env.S3_PUBLIC_BASE_URL || '';

console.log('endpoint :', endpoint || '(aws default!)');
console.log('region   :', region);
console.log('bucket   :', bucket);
console.log('pathStyle:', forcePathStyle);
console.log('publicURL:', publicBase ? publicBase : '(none → presigned mode)');
console.log('---');

if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
  console.error('FAIL: S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY пусты в .env');
  process.exit(1);
}

const client = new S3Client({
  region,
  forcePathStyle,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  ...(endpoint ? { endpoint } : {}),
});

// 1x1 прозрачный PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const key = `uploads/_r2_smoke_${process.pid}.png`;

(async () => {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: png,
      ContentType: 'image/png',
    }),
  );
  console.log('✅ PUT ok →', key, `(${png.length} bytes)`);

  const got = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const chunks = [];
  for await (const c of got.Body) chunks.push(c);
  const n = Buffer.concat(chunks).length;
  console.log('✅ GET ok →', n, 'bytes, match =', n === png.length);

  // presigned GET — ровно как читает приложение в приватном режиме
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 300 },
  );
  const resp = await fetch(url);
  const buf = Buffer.from(await resp.arrayBuffer());
  console.log(
    '✅ presigned GET → HTTP',
    resp.status,
    'content-type',
    resp.headers.get('content-type'),
    `(${buf.length} bytes)`,
  );

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log('✅ DELETE ok (cleanup)');
  console.log('\n🎉 R2 upload + read РАБОТАЮТ');
})().catch((e) => {
  console.error('\n❌ FAIL:', e.name, '-', e.message);
  if (e.name === 'NoSuchBucket')
    console.error('   → бакет', bucket, 'не найден. Проверь имя бакета в R2.');
  process.exit(1);
});
