import { OtpChannel } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

/**
 * Тело запроса `POST /api/v1/auth/otp/verify` (TASK-042, API.md §3).
 *
 * `channel` + `destination` повторяют контракт request-шага (тот же контакт, на
 * который был выписан код); формат, зависящий от канала, проверяется в сервисе
 * через {@link normalizeContact}. `code` — 6-значный OTP, сравнивается с хешем
 * (`otp_codes.code_hash`); здесь — только базовая проверка длины/типа.
 */
export class VerifyOtpDto {
  @IsEnum(OtpChannel)
  channel!: OtpChannel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  destination!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code!: string;
}
