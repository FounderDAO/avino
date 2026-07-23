import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

/** Тело `POST /api/v1/users/me/contact-phone/verify` — тот же destination + код. */
export class VerifyContactPhoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  destination!: string;

  @IsString()
  @Length(4, 8)
  code!: string;
}
