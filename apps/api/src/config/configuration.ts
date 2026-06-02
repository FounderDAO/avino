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

export const configurations = [
  appConfig,
  databaseConfig,
  redisConfig,
  s3Config,
  mapsConfig,
  smsConfig,
  translateConfig,
  mailConfig,
];
