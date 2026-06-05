import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query-параметры `GET /api/v1/chat/threads/:id/messages` (TASK-111, API.md §13).
 *
 * Keyset-пагинация: непрозрачный `cursor` (позиция последнего элемента прошлой
 * страницы) + `limit` (default 20, max 100 — API.md §4). Сортировка — свежие
 * сверху (`created_at DESC`), `next_cursor` листает в историю. Числа из query
 * приводит глобальный ValidationPipe (`enableImplicitConversion`).
 */
export class ListMessagesQueryDto {
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
