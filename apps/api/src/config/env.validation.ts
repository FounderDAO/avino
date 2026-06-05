import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Валидация переменных окружения (CLAUDE.md §3, TASK-022).
 *
 * Цель — fail-fast: если обязательные переменные отсутствуют или невалидны,
 * приложение не должно стартовать. Опциональные интеграции (S3, Yandex Maps,
 * Eskiz, Translate, SMTP) могут быть пустыми на старте проекта — их ключи
 * подставляются по мере подключения сервисов, поэтому они помечены как
 * optional и здесь не требуются.
 */

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum TranslateProvider {
  Yandex = 'yandex',
  Google = 'google',
}

export class EnvironmentVariables {
  // ── Node ──
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  // ── API ──
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  API_PORT: number = 4000;

  // ── PostgreSQL + PostGIS (обязательно) ──
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // ── Redis (обязательно) ──
  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  // ── S3-compatible storage (опционально на старте) ──
  @IsString()
  @IsOptional()
  S3_ENDPOINT?: string;

  @IsString()
  @IsOptional()
  S3_REGION?: string;

  @IsString()
  @IsOptional()
  S3_BUCKET?: string;

  @IsString()
  @IsOptional()
  S3_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  S3_SECRET_ACCESS_KEY?: string;

  // Строкой (не boolean): class-transformer привёл бы любую непустую строку,
  // включая "false", к true. Парсинг в configuration.ts (s3.forcePathStyle).
  @IsString()
  @IsOptional()
  S3_FORCE_PATH_STYLE?: string;

  @IsString()
  @IsOptional()
  S3_PUBLIC_BASE_URL?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  S3_SIGNED_URL_TTL?: number;

  // ── Yandex Maps (опционально на старте) ──
  @IsString()
  @IsOptional()
  YANDEX_MAPS_API_KEY?: string;

  // ── Eskiz.uz / SMS (опционально на старте) ──
  @IsString()
  @IsOptional()
  ESKIZ_EMAIL?: string;

  @IsString()
  @IsOptional()
  ESKIZ_PASSWORD?: string;

  @IsString()
  @IsOptional()
  ESKIZ_BASE_URL?: string;

  @IsString()
  @IsOptional()
  ESKIZ_FROM?: string;

  // ── Translation (опционально на старте) ──
  @IsEnum(TranslateProvider)
  @IsOptional()
  TRANSLATE_PROVIDER?: TranslateProvider;

  @IsString()
  @IsOptional()
  TRANSLATE_API_KEY?: string;

  @IsString()
  @IsOptional()
  TRANSLATE_FOLDER_ID?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  TRANSLATE_QUEUE_ATTEMPTS?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  TRANSLATE_QUEUE_CONCURRENCY?: number;

  // ── Истечение промо VIP/TOP (TASK-123, опционально — есть дефолты) ──
  @IsString()
  @IsOptional()
  PROMOTION_EXPIRY_CRON?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  PROMOTION_EXPIRY_CONCURRENCY?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  PROMOTION_EXPIRY_BATCH_SIZE?: number;

  // ── Saved-search алерты (TASK-102, опционально — есть дефолты) ──
  @IsString()
  @IsOptional()
  SAVED_SEARCH_ALERT_CRON?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  SAVED_SEARCH_ALERT_CONCURRENCY?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  SAVED_SEARCH_ALERT_BATCH_SIZE?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  SAVED_SEARCH_ALERT_MAX_LISTINGS?: number;

  // ── SMTP / email (опционально на старте) ──
  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  SMTP_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string;

  @IsString()
  @IsOptional()
  SMTP_FROM?: string;

  // Очередь email_queue (TASK-101): число попыток и параллелизм воркера.
  @IsInt()
  @Min(1)
  @IsOptional()
  EMAIL_QUEUE_ATTEMPTS?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  EMAIL_QUEUE_CONCURRENCY?: number;

  // ── OTP / rate limiting (опционально; есть безопасные дефолты, ENV.md §8) ──
  @IsInt()
  @Min(1)
  @IsOptional()
  OTP_TTL?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  OTP_MAX_ATTEMPTS?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  OTP_RESEND_COOLDOWN?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_WINDOW?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_MAX?: number;

  // ── JWT / auth (обязательно; секреты без дефолтов, ENV.md §7) ──
  // access и refresh подписываются РАЗНЫМИ секретами (ADR-0010). Отсутствие
  // секрета — fail-fast на старте, чтобы сессии не подписывались пустым ключом.
  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  JWT_ACCESS_TTL?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  JWT_REFRESH_TTL?: number;
}

/**
 * Используется как `validate` callback в ConfigModule.forRoot.
 * Конвертирует строковые env-значения в нужные типы (enableImplicitConversion)
 * и бросает понятную ошибку при невалидной конфигурации.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return validated;
}
