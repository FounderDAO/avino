import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ListingStatus, PropertyType, TransactionType } from '@prisma/client';

/**
 * Query-параметры `GET /api/v1/admin/listings` (TASK-053, API.md §16).
 *
 * Очередь модерации и админ-список объявлений. В отличие от owner-списка
 * (`/listings/mine`), DELETED НЕ скрывается: модератор должен видеть любые
 * статусы. Без `status` — возвращаются все статусы; типичный запрос очереди —
 * `?status=NEW`. Числа из query приводятся к `number` глобальным ValidationPipe
 * (`enableImplicitConversion`). Page-based пагинация (1-based) с обязательным
 * `meta.total` (API.md §4).
 */
export class ListAdminListingsQueryDto {
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @IsOptional()
  @IsEnum(PropertyType)
  property_type?: PropertyType;

  @IsOptional()
  @IsEnum(TransactionType)
  transaction_type?: TransactionType;

  /** Свободный текстовый поиск по заголовкам переводов (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
