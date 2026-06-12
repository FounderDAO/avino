import { IsBoolean } from 'class-validator';

/** Тело `PATCH /api/v1/admin/telegram-settings`. */
export class UpdateTelegramSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
