import { NotificationStatus, NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query-параметры `GET /api/v1/notifications` (TASK-100, API.md §14).
 *
 * Keyset-пагинация: непрозрачный `cursor` (позиция последнего элемента прошлой
 * страницы) + `limit` (default 20, max 100 — API.md §4). Опциональные фильтры
 * `status` / `type` сужают ленту по доставке/типу уведомления. Числа из query
 * приводит глобальный ValidationPipe (`enableImplicitConversion`); неизвестное
 * значение enum → `400 VALIDATION_ERROR`.
 */
export class ListNotificationsQueryDto {
  /** Фильтр по статусу доставки/прочтения (`PENDING|SENT|FAILED|READ`). */
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  /** Фильтр по типу уведомления (`NEW_CHAT_MESSAGE`, `PROMOTION_EXPIRED`, …). */
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

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
