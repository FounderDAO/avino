import { OtpChannel } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Тело запроса `POST /api/v1/auth/otp/request` (TASK-041, API.md §3).
 *
 * `channel` — канал доставки (`SMS | EMAIL`, enum `otp_channel` из БД-контракта).
 * `destination` — телефон (E.164) для SMS или email для EMAIL. Формат, зависящий
 * от канала, проверяется в сервисе через {@link normalizeContact} (cross-field
 * валидация); здесь — только базовые ограничения типа/длины.
 */
export class RequestOtpDto {
  @IsEnum(OtpChannel)
  channel!: OtpChannel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  destination!: string;
}
