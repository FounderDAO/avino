import { OtpChannel } from '@prisma/client';

/**
 * Нормализация и валидация контакта-получателя OTP (TASK-041).
 *
 * Формат зависит от канала и валидируется на уровне сервиса (cross-field
 * channel↔destination не выражается одним декоратором class-validator):
 * - SMS   → телефон в E.164 (`+998901234567`); пробелы/дефисы/скобки убираются;
 * - EMAIL → email (нижний регистр, обрезка пробелов).
 *
 * Возвращает нормализованное значение или `null`, если формат невалиден —
 * вызывающий код превращает `null` в `VALIDATION_ERROR` (API.md §4).
 */

// E.164: «+», первая цифра 1–9, всего 8–15 цифр.
const E164_RE = /^\+[1-9]\d{7,14}$/;
// Прагматичный email-паттерн (без попытки покрыть весь RFC 5322).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeContact(
  channel: OtpChannel,
  destination: string,
): string | null {
  if (channel === OtpChannel.SMS) {
    const phone = destination.replace(/[\s\-()]/g, '');
    return E164_RE.test(phone) ? phone : null;
  }

  const email = destination.trim().toLowerCase();
  return EMAIL_RE.test(email) && email.length <= 255 ? email : null;
}
