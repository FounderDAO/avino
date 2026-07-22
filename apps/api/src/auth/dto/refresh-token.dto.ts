import { IsJWT, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Тело запросов `POST /api/v1/auth/refresh` и `POST /api/v1/auth/logout`
 * (TASK-043, API.md §3). Токен принимается из двух источников (ADR-0153):
 * httpOnly cookie `avino_rt` (web-клиенты) ИЛИ тело `{ "refresh_token": "eyJ..." }`
 * (mobile/Flutter). Поэтому поле **опционально** на уровне DTO — источник
 * выбирает контроллер (`req.cookies.avino_rt ?? body.refresh_token`); отсутствие
 * обоих даёт `400 VALIDATION_ERROR` уже в контроллере.
 *
 * `@IsJWT` по-прежнему отсекает заведомо невалидное ЗНАЧЕНИЕ в теле, если оно
 * передано; подпись, ротация и reuse-detection проверяются в {@link TokenService}.
 * Имя свойства повторяет snake_case ключ контракта.
 */
export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refresh_token?: string;
}
