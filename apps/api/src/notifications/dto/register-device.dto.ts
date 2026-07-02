import { ApiProperty } from '@nestjs/swagger';
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
  /** Платформа устройства: FCM-токен (ANDROID) / APNs-токен (iOS) / веб-push (WEB). */
  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiProperty({ minLength: 1, maxLength: 512 })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  push_token!: string;
}
