import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';

/**
 * Разбор унифицированного error-envelope API (docs/API.md §4/§17):
 *   { "error": { "code", "message", "request_id", "details"? } }
 *
 * RTK Query кладёт распарсенное тело в `error.data`, а HTTP-статус — в
 * `error.status`. Хелпер вытаскивает стабильный `code` (часть контракта),
 * чтобы UI мапил его на человекочитаемый текст, не завязываясь на `message`.
 */

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

export interface ApiError {
  code: string;
  message: string;
  request_id?: string;
  details?: ApiErrorDetail[];
}

interface ApiErrorEnvelope {
  error: ApiError;
}

function hasErrorEnvelope(data: unknown): data is ApiErrorEnvelope {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'object' &&
    (data as { error: unknown }).error !== null &&
    typeof (data as ApiErrorEnvelope).error.code === 'string'
  );
}

/** Достаёт `{ code, message, ... }` из ошибки RTK Query, либо `null`. */
export function getApiError(
  error: FetchBaseQueryError | SerializedError | undefined,
): ApiError | null {
  if (!error || !('data' in error)) return null;
  return hasErrorEnvelope(error.data) ? error.data.error : null;
}

/** Стабильный код ошибки (`OTP_INVALID`, `RATE_LIMITED`, …) или `null`. */
export function getApiErrorCode(
  error: FetchBaseQueryError | SerializedError | undefined,
): string | null {
  return getApiError(error)?.code ?? null;
}

/**
 * Признак сетевого/транспортного сбоя без бизнес-кода: fetch упал
 * (сеть/CORS/таймаут) или ответ пришёл без распознаваемого error-envelope.
 *
 * RTK Query помечает такие случаи нечисловым `status`
 * (`FETCH_ERROR` / `TIMEOUT_ERROR` / `PARSING_ERROR` / `CUSTOM_ERROR`).
 * UI использует это, чтобы показать внятный fallback вместо тишины, когда
 * `getApiError` не смог достать стабильный `code` (TASK-213).
 */
export function isNetworkError(
  error: FetchBaseQueryError | SerializedError | undefined,
): boolean {
  if (!error) return false;
  // Уже распознанный бизнес-код — это не сетевой сбой.
  if (getApiError(error)) return false;
  if ('status' in error) {
    return (
      error.status === 'FETCH_ERROR' ||
      error.status === 'TIMEOUT_ERROR' ||
      error.status === 'PARSING_ERROR' ||
      error.status === 'CUSTOM_ERROR'
    );
  }
  // SerializedError (брошенное исключение) без HTTP-статуса — тоже транспорт.
  return true;
}
