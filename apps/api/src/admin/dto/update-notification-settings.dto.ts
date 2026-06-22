import { IsBoolean, IsOptional } from 'class-validator';

/** Тело `PATCH /api/v1/admin/notification-settings`. Оба поля опциональны —
 * partial update обновляет только переданные каналы. */
export class UpdateNotificationSettingsDto {
  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  pushEnabled?: boolean;
}
