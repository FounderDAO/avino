import { DevicePlatform } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body `POST /api/v1/notifications/devices` (API.md §14, ADR-0010).
 *
 * Регистрация push-токена устройства под будущее Flutter-приложение. `push_token`
 * — непрозрачный идентификатор от FCM (Android) / APNs (iOS); ограничение длины
 * совпадает с колонкой `notification_devices.push_token VARCHAR(512)`. Контракт
 * snake_case (как у остальных DTO портала). Регистрация идемпотентна (upsert по
 * `push_token`), поэтому отдельного поля «device_id» не требуется.
 */
export class RegisterDeviceDto {
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  push_token!: string;
}
