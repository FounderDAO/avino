import { registerAs } from '@nestjs/config';

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

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL,
}));

export const s3Config = registerAs('s3', () => ({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  bucket: process.env.S3_BUCKET,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
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
}));

export const mailConfig = registerAs('mail', () => ({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? '587', 10),
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  from: process.env.SMTP_FROM,
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

export const configurations = [
  appConfig,
  databaseConfig,
  redisConfig,
  s3Config,
  mapsConfig,
  smsConfig,
  translateConfig,
  mailConfig,
  otpConfig,
  rateLimitConfig,
  jwtConfig,
];
