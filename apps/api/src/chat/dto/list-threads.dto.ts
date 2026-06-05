import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query-параметры `GET /api/v1/chat/threads` (TASK-110, API.md §13).
 *
 * Keyset-пагинация: непрозрачный `cursor` (позиция последнего элемента прошлой
 * страницы) + `limit` (default 20, max 100 — API.md §4). Сортировка — по
 * последней активности треда (`last_message_at DESC NULLS LAST`, затем
 * `created_at DESC`). Числа из query приводит глобальный ValidationPipe
 * (`enableImplicitConversion`).
 */
export class ListThreadsQueryDto {
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
