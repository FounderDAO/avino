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

  // ── CORS (опционально; есть dev-дефолт http://localhost:3000, ENV.md §15) ──
  // CSV разрешённых origin'ов. Парсинг в configuration.ts (cors.origins).
  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

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

  // ── Продвижение объявлений (ADR-0100): master-флаг доступности + истечение ──
  // Булева как строка (class-transformer привёл бы любую непустую к true).
  @IsString()
  @IsOptional()
  PROMOTION_ENABLED?: string;

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

  // Тест-стенд: доставка телефонного OTP через Telegram (admin-чат), минуя Eskiz.
  // Булева как строка (class-transformer привёл бы любую непустую к true).
  @IsString()
  @IsOptional()
  OTP_TELEGRAM_DELIVERY?: string;

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

  // ── Google Sign-In (опционально на старте) ──
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  // ── Sign in with Apple (опционально на старте) ──
  @IsString()
  @IsOptional()
  APPLE_CLIENT_ID?: string;

  // ── Telegram admin-алерты (опционально на старте) ──
  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;

  @IsString()
  @IsOptional()
  TELEGRAM_ADMIN_CHAT_ID?: string;

  // Булевы как строки (class-transformer привёл бы любую непустую к true).
  @IsString()
  @IsOptional()
  TELEGRAM_INCLUDE_OTP_CODE?: string;

  @IsString()
  @IsOptional()
  TELEGRAM_NOTIFICATION_STATE?: string;

  // ── Exchange rate / cbu.uz (опционально — есть дефолты, ключ не нужен) ──
  @IsString()
  @IsOptional()
  EXCHANGE_RATE_CRON?: string;

  @IsString()
  @IsOptional()
  EXCHANGE_RATE_TZ?: string;

  @IsString()
  @IsOptional()
  CBU_BASE_URL?: string;

  // ── Swagger / OpenAPI UI (опционально на старте) ──
  @IsString()
  @IsOptional()
  SWAGGER_ENABLED?: string;

  @IsString()
  @IsOptional()
  SWAGGER_USER?: string;

  @IsString()
  @IsOptional()
  SWAGGER_PASS?: string;
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
