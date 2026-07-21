import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Тело `POST /api/v1/users/me/contact-phone/request`. Канал всегда SMS
 * (контакт — телефон), поэтому только `destination`; строгая валидация E.164
 * делается нормализацией в сервисе (`normalizeContact`).
 */
export class RequestContactPhoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  destination!: string;
}
