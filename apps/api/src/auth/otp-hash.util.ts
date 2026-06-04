import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const OTP_DIGITS = 6;

/**
 * Хеширование OTP-кодов (TASK-041, DB_SCHEMA §4 `otp_codes.code_hash`).
 *
 * OTP — низкоэнтропийный секрет (6 цифр ≈ 10^6 вариантов), поэтому хранить его
 * нужно МЕДЛЕННЫМ хешем с солью: при утечке БД перебор миллиона комбинаций
 * через scrypt дорог, в отличие от SHA-256. Соль уникальна на код и хранится
 * внутри строки хеша (`salt:key`, оба hex) — отдельный секрет/pepper не требуется
 * (CLAUDE.md §3 «никаких дефолтов для секретов»).
 *
 * Формат строки: `<saltHex>:<keyHex>` укладывается в varchar(255).
 */

/** Сгенерировать криптослучайный 6-значный код (ведущие нули сохраняются). */
export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_DIGITS)
    .toString()
    .padStart(OTP_DIGITS, '0');
}

/** Захешировать код (scrypt + случайная соль). */
export async function hashOtpCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(code, salt, KEY_BYTES)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

/**
 * Проверить код против хранимого хеша. Сравнение — constant-time
 * ({@link timingSafeEqual}), чтобы не утекало через тайминг. Любой
 * некорректный формат хранимого хеша трактуется как несовпадение.
 */
export async function verifyOtpCode(
  code: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  const derived = (await scryptAsync(code, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}
