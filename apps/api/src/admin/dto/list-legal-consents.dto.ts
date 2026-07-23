import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query-параметры `GET /api/v1/admin/legal-consents` — журнал согласий с
 * Правилами и Политикой.
 *
 * `search` — substring-поиск по пользователю (телефон/email/имя профиля).
 * `version` — точный фильтр по app-wide версии согласия. `from`/`to` — диапазон
 * по `accepted_at` (ISO-8601). Page-based пагинация (1-based), `meta.total`
 * обязателен (API.md §4).
 */
export class ListLegalConsentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

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
