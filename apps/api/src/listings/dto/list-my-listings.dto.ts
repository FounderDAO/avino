import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ListingStatus } from '@prisma/client';

/**
 * Query-параметры `GET /api/v1/listings/mine` (TASK-052, API.md §7).
 *
 * Список собственных объявлений текущего пользователя. Простой админ-/owner-список —
 * используется page-based пагинация (1-based) + `limit` с обязательным `meta.total`
 * (API.md §4); keyset зарезервирован для публичного поиска/листингов. Числа из query
 * приводятся к `number` глобальным ValidationPipe (`enableImplicitConversion`).
 *
 * `status` принимает любой `listing_status`, КРОМЕ практического смысла `DELETED`:
 * soft-deleted листинги исключены из всех read-path (API.md §7), поэтому сервис
 * всегда отфильтровывает `DELETED` (см. {@link ListingsService.findMine}).
 */
export class ListMyListingsQueryDto {
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

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
