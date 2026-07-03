import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Amenity, Currency, ParkingType, PropertyType, TransactionType } from '@prisma/client';
import { TourWindowDto } from './create-listing.dto';
import { IsHalfStep } from '../../common/validation/is-half-step';

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
 * Все поля опциональны (PATCH). `original_language`, `owner_id` и `status`
 * менять здесь напрямую нельзя: `original_language` фиксируется при создании
 * (ADR-005), явную смену `status` выполняет только модерация (API.md §16).
 * Исключение: правка `ACTIVE`-объявления автоматически возвращает его в `NEW`
 * на повторную модерацию (ADR-0120). Ре-генерация машинных переводов после
 * правки оригинала пока не автоматизирована; здесь правится только авторский
 * перевод (модератор перегенерирует остальные языки вручную, ADR-0091).
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

  /** Жилая площадь, м² (мобилка #10; клиент показывает для дома/особняка). */
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'living_area must be a decimal string with up to 2 fraction digits' })
  living_area?: string;

  /** Нежилая площадь, м² (кухня/санузлы/коридоры). */
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'non_living_area must be a decimal string with up to 2 fraction digits' })
  non_living_area?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  rooms?: number;

  /** Санузлы, шаг 0.5 (1, 1.5, 2 …) — баглист мобилки #3. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsHalfStep()
  @Min(0)
  @Max(99)
  bathrooms?: number;

  @IsOptional()
  @IsEnum(ParkingType)
  parking_type?: ParkingType;

  @IsOptional()
  @IsArray()
  @IsEnum(Amenity, { each: true })
  amenities?: Amenity[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SMALLINT_MAX)
  floor?: number;

  /** Цокольный этаж (баглист мобилки #4). При true клиент обычно шлёт floor: null. */
  @IsOptional()
  @IsBoolean()
  is_basement?: boolean;

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
