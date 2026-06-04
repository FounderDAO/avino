import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query-параметры `GET /api/v1/saved-searches` (TASK-091, API.md §12).
 *
 * Сохранённых поисков у пользователя мало, поэтому пагинация простая: `limit`
 * (default 20, max 100 — API.md §4) + `total` в `meta`, без keyset-курсора
 * (контракт §12 показывает только `{ limit, total }`). Числа из query приводит
 * глобальный ValidationPipe (`enableImplicitConversion`).
 */
export class ListSavedSearchesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
