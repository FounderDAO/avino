import { createHmac } from 'node:crypto';

/**
 * Детерминированный хеш refresh-токена для хранения и поиска (TASK-042, ADR-0010).
 *
 * `refresh_tokens.token_hash` индексируется обычным btree, поэтому хеш ОБЯЗАН
 * быть детерминированным — соль фиксируется на уровне схемы хеша, а не на строку
 * (в отличие от OTP, см. {@link hashOtpCode}). Берём HMAC-SHA256 с
 * `JWT_REFRESH_SECRET` как pepper: дамп БД не раскрывает токены (нужен ещё и
 * серверный секрет), а проверка предъявленного токена остаётся точечным lookup'ом
 * по равенству хеша.
 *
 * Результат — 64 hex-символа, укладывается в `varchar(255)`.
 */
export function hashRefreshToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
