import { Language } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Тело запроса `PATCH /api/v1/users/me` (TASK-040, API.md §5).
 *
 * Базовые поля пользователя, меняемые напрямую. В foundation — только
 * `default_language`.
 *
 * Смена логин-контакта (`email`/`phone`) здесь НЕ поддержана намеренно: оба
 * требуют подтверждения владения новым значением OTP-кодом — отдельный flow
 * `POST /api/v1/users/me/contact-change/{request,verify}`
 * (`OtpPurpose.CONTACT_CHANGE`). `forbidNonWhitelisted` отклонит любые поля вне
 * этого DTO (включая `email`/`phone`).
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEnum(Language)
  default_language?: Language;
}
