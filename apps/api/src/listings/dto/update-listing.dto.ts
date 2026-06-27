import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Currency, ParkingType, PropertyType, TransactionType } from '@prisma/client';
import { TourWindowDto } from './create-listing.dto';

const DECIMAL_2 = /^\d{1,12}(\.\d{1,2})?$/;
const SMALLINT_MAX = 32767;

/**
 * Частичное обновление авторского перевода (`original_language`). Все поля
 * опциональны — обновляется только переданное подмножество (PATCH-семантика).
 */
export class UpdateListingTranslationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

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
 * Тело запроса `PATCH /api/v1/listings/:id` (TASK-050, API.md §7).
 *
 * Все поля опциональны (PATCH). `original_language`, `owner_id`, `status` и
 * `currency`-сделка менять здесь нельзя: `original_language` фиксируется при
 * создании (ADR-005), смену `status` выполняет только модерация (API.md §16).
 * Ре-генерация переводов и возврат в модерацию после правки `ACTIVE` — отдельная
 * задача M5 (`translate_listing`); здесь правится только авторский перевод.
 */
export class UpdateListingDto {
  @IsOptional()
  @IsEnum(TransactionType)
  transaction_type?: TransactionType;

  @IsOptional()
  @IsEnum(PropertyType)
  property_type?: PropertyType;

  @IsOptional()
  @Matches(DECIMAL_2, {
    message: 'price must be a decimal string with up to 2 fraction digits',
  })
  price?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @Matches(DECIMAL_2, {
    message: 'area must be a decimal string with up to 2 fraction digits',
  })
  area?: string;

  @IsOptional()
  @Matches(DECIMAL_2, { message: 'lot_area must be a decimal string with up to 2 fraction digits' })
  lot_area?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  rooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  bathrooms?: number;

  @IsOptional()
  @IsEnum(ParkingType)
  parking_type?: ParkingType;

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

  @IsOptional()
  @IsLatitude()
  latitude?: string;

  @IsOptional()
  @IsLongitude()
  longitude?: string;

  @IsOptional()
  @IsBoolean()
  tours_enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TourWindowDto)
  tour_windows?: TourWindowDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateListingTranslationDto)
  translation?: UpdateListingTranslationDto;
}
