import { registerAs } from '@nestjs/config';
import { parseCorsOrigins } from '../common/cors/cors.options';
import { resolveSwaggerEnabled } from '../common/openapi/swagger.gating';

/**
 * Типизированные namespaced-конфиги (TASK-022).
 *
 * Доступ через ConfigService:
 *   configService.get('database.url')
 *   configService.get<AppConfig>('app')
 *
 * Значения уже провалидированы в env.validation.ts на этапе старта.
 */

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.API_PORT ?? '4000', 10),
}));

// CORS allowlist (TASK-024, ENV.md §15). Origin-список НЕ хардкодится — берётся
// из CORS_ORIGINS (CSV). Без переменной — dev-дефолт http://localhost:3000
// (origin самой админки в dev); в prod значение обязательно задаётся явно.
export const corsConfig = registerAs('cors', () => ({
  origins: parseCorsOrigins(
    process.env.CORS_ORIGINS ?? 'http://localhost:3000',
  ),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL,
}));

export const s3Config = registerAs('s3', () => ({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  // S3-compatible (MinIO/Spaces) обычно требует path-style. Дефолт true;
  // явный "false" нужен для нативного AWS S3 с virtual-hosted-style.
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  // Базовый публичный URL/CDN. Если задан — getObjectUrl возвращает публичный
  // URL (объекты заливаются с public-read ACL). Если пуст — возвращается
  // presigned GET URL (приватный bucket). См. ARCHITECTURE §14, ENV §9.
  publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
  signedUrlTtl: parseInt(process.env.S3_SIGNED_URL_TTL ?? '3600', 10),
}));

export const mapsConfig = registerAs('maps', () => ({
  yandexApiKey: process.env.YANDEX_MAPS_API_KEY,
}));

export const smsConfig = registerAs('sms', () => ({
  eskizEmail: process.env.ESKIZ_EMAIL,
  eskizPassword: process.env.ESKIZ_PASSWORD,
  eskizBaseUrl: process.env.ESKIZ_BASE_URL,
  eskizFrom: process.env.ESKIZ_FROM,
}));

export const translateConfig = registerAs('translate', () => ({
  provider: process.env.TRANSLATE_PROVIDER ?? 'yandex',
  apiKey: process.env.TRANSLATE_API_KEY,
  folderId: process.env.TRANSLATE_FOLDER_ID,
  queueAttempts: parseInt(process.env.TRANSLATE_QUEUE_ATTEMPTS ?? '3', 10),
  queueConcurrency: parseInt(
    process.env.TRANSLATE_QUEUE_CONCURRENCY ?? '2',
    10,
  ),
}));

// Фоновое истечение промо VIP/TOP (TASK-123, ENV.md). expiryCron — расписание
// repeatable-джобы (по умолчанию каждую минуту); concurrency воркера и размер
// батча sweep'а ограничивают нагрузку на БД. Поиск и так time-guard'ит истёкшую
// промо в SQL (ADR-0004 §4), джоба лишь приводит ledger/read-cache в покой.
export const promotionConfig = registerAs('promotion', () => ({
  expiryCron: process.env.PROMOTION_EXPIRY_CRON ?? '* * * * *',
  expiryConcurrency: parseInt(
    process.env.PROMOTION_EXPIRY_CONCURRENCY ?? '1',
    10,
  ),
  expiryBatchSize: parseInt(process.env.PROMOTION_EXPIRY_BATCH_SIZE ?? '100', 10),
}));

// Polling-матчер saved-search алертов (TASK-102, ENV.md). alertCron — расписание
// repeatable-джобы check_saved_searches (по умолчанию каждые 5 минут — алерты не
// требуют минутной срочности); concurrency воркера, alertBatchSize — число
// поисков за прогон, alertMaxListings — потолок алертов на один поиск за прогон
// (защита от широкого поиска; остаток подхватывается следующим прогоном).
export const savedSearchConfig = registerAs('savedSearch', () => ({
  alertCron: process.env.SAVED_SEARCH_ALERT_CRON ?? '*/5 * * * *',
  alertConcurrency: parseInt(
    process.env.SAVED_SEARCH_ALERT_CONCURRENCY ?? '1',
    10,
  ),
  alertBatchSize: parseInt(
    process.env.SAVED_SEARCH_ALERT_BATCH_SIZE ?? '100',
    10,
  ),
  alertMaxListings: parseInt(
    process.env.SAVED_SEARCH_ALERT_MAX_LISTINGS ?? '50',
    10,
  ),
}));

// SMTP / email-доставка (TASK-041, TASK-101, ENV.md §13). host/креды опциональны
// на старте (в dev письмо логируется). queueAttempts/queueConcurrency — ретраи и
// параллелизм воркера `email_queue` (по аналогии с translate.*). from имеет
// non-secret дефолт.
export const mailConfig = registerAs('mail', () => ({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  from: process.env.SMTP_FROM ?? 'no-reply@avino.uz',
  queueAttempts: parseInt(process.env.EMAIL_QUEUE_ATTEMPTS ?? '3', 10),
  queueConcurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY ?? '2', 10),
}));

// OTP-параметры (TASK-041, ENV.md §8). maxAttempts используется при verify
// (TASK-042) — заводим весь namespace сразу, чтобы не переописывать конфиг.
export const otpConfig = registerAs('otp', () => ({
  ttl: parseInt(process.env.OTP_TTL ?? '300', 10),
  maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
  resendCooldown: parseInt(process.env.OTP_RESEND_COOLDOWN ?? '60', 10),
}));

// Общий per-IP rate-limit (TASK-041, ENV.md §8).
export const rateLimitConfig = registerAs('rateLimit', () => ({
  window: parseInt(process.env.RATE_LIMIT_WINDOW ?? '60', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
}));

// JWT / auth-токены (TASK-042, ENV.md §7). access и refresh подписываются
// РАЗНЫМИ секретами; refresh хранится хешированным и ротируется (ADR-0010).
// Секреты обязательны и провалидированы в env.validation.ts — дефолтов нет
// (CLAUDE.md §3 «никаких дефолтов для секретов»).
export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
  refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
}));

// Google Sign-In (passwordless вход публичного портала). clientId опционален на
// старте — без него /auth/google отдаёт 503 AUTH_PROVIDER_UNAVAILABLE.
export const googleConfig = registerAs('google', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
}));

// Swagger / OpenAPI UI (config-gated). enabled определяется resolveSwaggerEnabled:
// явный SWAGGER_ENABLED env → его значение; иначе dev=true / prod=false.
export const swaggerConfig = registerAs('swagger', () => ({
  enabled: resolveSwaggerEnabled(process.env.SWAGGER_ENABLED, process.env.NODE_ENV),
  basicAuthUser: process.env.SWAGGER_USER,
  basicAuthPass: process.env.SWAGGER_PASS,
}));

// Telegram admin-алерты (config-gated, как sms/email). Булевы хранятся строкой
// в env (class-transformer привёл бы любую непустую к true) и парсятся здесь.
export const telegramConfig = registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
  // Включать ли сам OTP-код в сообщение (MVP). Default true.
  includeOtpCode: process.env.TELEGRAM_INCLUDE_OTP_CODE !== 'false',
  // Master-флаг по умолчанию: явное значение → оно; иначе dev=true / prod=false.
  // Перебивается runtime-строкой в app_settings (admin-тоггл).
  notificationStateDefault:
    process.env.TELEGRAM_NOTIFICATION_STATE != null
      ? process.env.TELEGRAM_NOTIFICATION_STATE === 'true'
      : process.env.NODE_ENV !== 'production',
}));

export const configurations = [
  appConfig,
  corsConfig,
  databaseConfig,
  redisConfig,
  s3Config,
  mapsConfig,
  smsConfig,
  translateConfig,
  promotionConfig,
  savedSearchConfig,
  mailConfig,
  otpConfig,
  rateLimitConfig,
  jwtConfig,
  googleConfig,
  telegramConfig,
  swaggerConfig,
];
