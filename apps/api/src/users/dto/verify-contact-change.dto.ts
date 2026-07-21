import { OtpChannel } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

/**
 * Тело запроса `POST /api/v1/users/me/contact-change/verify` (смена логин-контакта).
 *
 * `channel` + `destination` повторяют контракт request-шага (тот же новый контакт,
 * на который был выписан код); `code` — 6-значный OTP (длина как у login-`VerifyOtpDto`).
 */
export class VerifyContactChangeDto {
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
