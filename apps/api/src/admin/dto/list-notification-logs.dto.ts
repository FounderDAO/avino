import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@prisma/client';

/**
 * Query-параметры `GET /api/v1/admin/notification-logs` (TASK-131, API.md §16).
 *
 * Глобальный журнал уведомлений (`notifications`, TASK-100..102/111/121).
 * Фильтры `user_id` / `type` / `channel` / `status` комбинируются через AND.
 * Page-based пагинация (1-based) с обязательным `meta.total` (API.md §4).
 */
export class ListNotificationLogsQueryDto {
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

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
