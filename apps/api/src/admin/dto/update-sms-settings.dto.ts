import { IsBoolean } from 'class-validator';

/** Тело `PATCH /api/v1/admin/sms-settings`. */
export class UpdateSmsSettingsDto {
  @IsBoolean()
  enabled!: boolean;
}
