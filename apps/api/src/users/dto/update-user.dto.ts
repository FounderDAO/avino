import { Language } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, MaxLength } from 'class-validator';

/**
 * Тело запроса `PATCH /api/v1/users/me` (TASK-040, API.md §5).
 *
 * Любое подмножество базовых полей пользователя. В foundation поддерживаются
 * `email` и `default_language`:
 *  - смена `email` инициирует re-verify (сервис сбрасывает `is_email_verified`)
 *    и проверяет уникальность среди non-DELETED аккаунтов (CONTACT_TAKEN, ADR-013);
 *  - смена `phone` НЕ поддержана здесь намеренно: для неё нужен OTP verify-flow
 *    смены контакта (`OtpPurpose` пока только `LOGIN`) — отдельная задача.
 *
 * Имена свойств повторяют snake_case ключи контракта (как в `RefreshTokenDto`).
 * `forbidNonWhitelisted` отклонит любые поля вне этого DTO (включая `phone`).
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsEnum(Language)
  default_language?: Language;
}
