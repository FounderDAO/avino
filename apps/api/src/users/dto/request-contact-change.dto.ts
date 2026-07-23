import { OtpChannel } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Тело запроса `POST /api/v1/users/me/contact-change/request` (смена логин-контакта).
 *
 * `channel` выбирает контакт: `SMS` меняет телефон входа, `EMAIL` — email входа.
 * `destination` — НОВОЕ значение контакта; формат, зависящий от канала,
 * проверяется в сервисе через {@link normalizeContact} (как в OTP-логине).
 */
export class RequestContactChangeDto {
  @IsEnum(OtpChannel)
  channel!: OtpChannel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  destination!: string;
}
