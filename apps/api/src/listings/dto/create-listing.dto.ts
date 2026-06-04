import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  Currency,
  Language,
  PropertyType,
  TransactionType,
} from '@prisma/client';

/**
 * Денежные/площадные поля — строки-Decimal, никогда float (ADR-002). До 12 цифр
 * целой части и до 2 дробных (`listings.price` — Decimal(14,2)).
 */
const DECIMAL_2 = /^\d{1,12}(\.\d{1,2})?$/;

/** PostgreSQL `SmallInt` — допустимый диапазон значений для rooms/floor/year_built. */
const SMALLINT_MAX = 32767;

/**
 * Авторский перевод объявления на `original_language` (API.md §7, ADR-005).
 * Сохраняется как `ListingTranslation` с `source=USER`, `is_auto_translated=false`;
 * машинные переводы (uz/ru/en) генерируются отдельной задачей после `ACTIVE`.
 */
export class CreateListingTranslationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  address_note?: string;

  @IsOptional()
  @IsString()
  features_text?: string;
}

/**
 * Тело запроса `POST /api/v1/listings` (TASK-050, API.md §7).
 *
 * Объявление создаётся на одном языке (`original_language`) со статусом `NEW`
 * и проходит moderation queue (CLAUDE.md §9). `feature_ids` и медиа — отдельные
 * задачи M5, здесь не принимаются (`forbidNonWhitelisted` отклонит лишние поля).
 * Имена свойств — snake_case ключи контракта (как в остальных DTO).
 */
export class CreateListingDto {
  @IsEnum(TransactionType)
  transaction_type!: TransactionType;

  @IsEnum(PropertyType)
  property_type!: PropertyType;

  @IsEnum(Language)
  original_language!: Language;

  @Matches(DECIMAL_2, {
    message: 'price must be a decimal string with up to 2 fraction digits',
  })
  price!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @IsOptional()
  @Matches(DECIMAL_2, {
    message: 'area must be a decimal string with up to 2 fraction digits',
  })
  area?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  rooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  floor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  total_floors?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  year_built?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsUUID()
  city_id?: string;

  @IsOptional()
  @IsUUID()
  district_id?: string;

  @IsOptional()
  @IsUUID()
  agency_id?: string;

  // Координаты — только из map-picker, никогда из EXIF фото (ADR-008). Источник
  // для PostGIS `location` (синхронизация — отдельная гео-задача).
  @IsOptional()
  @IsLatitude()
  latitude?: string;

  @IsOptional()
  @IsLongitude()
  longitude?: string;

  @ValidateNested()
  @Type(() => CreateListingTranslationDto)
  translation!: CreateListingTranslationDto;
}
