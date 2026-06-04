import { IsJWT, IsNotEmpty, IsString } from 'class-validator';

/**
 * Тело запросов `POST /api/v1/auth/refresh` и `POST /api/v1/auth/logout`
 * (TASK-043, API.md §3). Оба эндпоинта принимают один и тот же refresh-токен в
 * теле — `{ "refresh_token": "eyJ..." }`.
 *
 * `@IsJWT` отсекает заведомо невалидные значения на уровне DTO
 * (`VALIDATION_ERROR`); подпись, ротация и reuse-detection проверяются в
 * {@link TokenService}. Имя свойства повторяет snake_case ключ контракта.
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refresh_token!: string;
}
