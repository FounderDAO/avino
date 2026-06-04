import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query-параметры `GET /api/v1/favorites` (TASK-090, API.md §11).
 *
 * Keyset-пагинация: непрозрачный `cursor` (позиция последнего элемента прошлой
 * страницы) + `limit` (default 20, max 100 — API.md §4). Числа из query приводит
 * глобальный ValidationPipe (`enableImplicitConversion`).
 */
export class ListFavoritesQueryDto {
  /** Непрозрачный keyset-токен последней позиции предыдущей страницы. */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
