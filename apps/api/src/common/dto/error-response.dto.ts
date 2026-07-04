/**
 * Контракт ошибки API (TASK-023).
 *
 * Единый envelope ошибки на всех эндпоинтах — см. docs/API.md §4 "Error format"
 * и §17 "Error catalog". Контракт клиент-нейтрален: один и тот же формат для web
 * (RTK Query) и будущего Flutter-клиента (CLAUDE.md §3, §18).
 *
 * Коды (`error.code`) стабильны и являются частью API-контракта: их нельзя
 * переименовывать без перехода на новую версию API (CLAUDE.md §14).
 */

/**
 * Стабильные машинно-читаемые коды ошибок (каталог — docs/API.md §17).
 * Значения UPPERCASE и зафиксированы как часть контракта.
 */
export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REUSED = 'TOKEN_REUSED',
  OTP_INVALID = 'OTP_INVALID',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_ATTEMPTS_EXCEEDED = 'OTP_ATTEMPTS_EXCEEDED',
  RATE_LIMITED = 'RATE_LIMITED',
  USER_BLOCKED = 'USER_BLOCKED',
  AUTH_PROVIDER_UNAVAILABLE = 'AUTH_PROVIDER_UNAVAILABLE',
  ACCOUNT_LINK_REQUIRED = 'ACCOUNT_LINK_REQUIRED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONTACT_TAKEN = 'CONTACT_TAKEN',
  ROLE_ALREADY_GRANTED = 'ROLE_ALREADY_GRANTED',
  ALREADY_FAVORITED = 'ALREADY_FAVORITED',
  DEVICE_TOKEN_EXISTS = 'DEVICE_TOKEN_EXISTS',
  ACTIVE_PROMOTION_EXISTS = 'ACTIVE_PROMOTION_EXISTS',
  LISTING_NOT_AVAILABLE = 'LISTING_NOT_AVAILABLE',
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',
  PROFILE_INCOMPLETE = 'PROFILE_INCOMPLETE',
  TOUR_REQUEST_DUPLICATE = 'TOUR_REQUEST_DUPLICATE',
  TOUR_SLOT_TAKEN = 'TOUR_SLOT_TAKEN',
  CONSENT_INCOMPLETE = 'CONSENT_INCOMPLETE',
  INVALID_PERIOD = 'INVALID_PERIOD',
  PROMOTION_NOT_ACTIVE = 'PROMOTION_NOT_ACTIVE',
  UNSUPPORTED_FILTER_SCHEMA = 'UNSUPPORTED_FILTER_SCHEMA',
  UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  MEDIA_LIMIT_EXCEEDED = 'MEDIA_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Пер-полевая деталь ошибки валидации (docs/API.md §4).
 * `field` — путь к полю (с точками для вложенных DTO), `issue` — причина.
 */
export interface ApiErrorDetail {
  field: string;
  issue: string;
}

/**
 * Тело ошибки внутри envelope.
 * - `code` — стабильный код (см. {@link ApiErrorCode}); тип расширен до string,
 *   т.к. фреймворк может вернуть статус вне каталога (graceful fallback).
 * - `message` — человекочитаемое описание (язык по `Accept-Language`).
 * - `details` — опционально, пер-полевые ошибки валидации.
 * - `request_id` — коррелирует ответ с серверными логами.
 */
export interface ApiErrorBody {
  code: ApiErrorCode | string;
  message: string;
  details?: ApiErrorDetail[];
  request_id: string;
}

/** Единый envelope ошибки: `{ "error": { ... } }` (docs/API.md §4). */
export interface ApiErrorResponse {
  error: ApiErrorBody;
}

/**
 * Структурированная полезная нагрузка, которую доменный/валидационный код кладёт
 * в `HttpException`, чтобы фильтр взял из неё `code`/`details` напрямую
 * (вместо вывода кода из HTTP-статуса). Все поля опциональны.
 */
export interface ApiExceptionPayload {
  code?: ApiErrorCode | string;
  message?: string;
  details?: ApiErrorDetail[];
}
