/**
 * phone-mask — юнит-тесты чистых функций маски узбекского номера
 * (+998 XX XXX XX XX). Спека: docs/superpowers/specs/2026-07-17-phone-mask-design.md.
 */
import { describe, it, expect } from 'vitest';
import {
  uzPhoneDigits,
  formatUzPhone,
  uzPhoneE164,
  uzPhoneComplete,
} from './phone-mask';

describe('uzPhoneDigits', () => {
  it('пустой и нецифровой ввод → пустая строка', () => {
    expect(uzPhoneDigits('')).toBe('');
    expect(uzPhoneDigits('abc')).toBe('');
  });

  it('локальные 9 цифр проходят как есть', () => {
    expect(uzPhoneDigits('901234567')).toBe('901234567');
  });

  it('литеральный префикс «+998» отбрасывается (значение из маски/E.164)', () => {
    expect(uzPhoneDigits('+998901234567')).toBe('901234567');
    expect(uzPhoneDigits('+998 90 123 45 67')).toBe('901234567');
  });

  it('вставка международного без «+» отбрасывает ведущий 998', () => {
    expect(uzPhoneDigits('998901234567')).toBe('901234567');
  });

  it('оператор 99: ведущие 998 в 9-значном локальном номере сохраняются', () => {
    expect(uzPhoneDigits('+998 99 812 34 56')).toBe('998123456');
    expect(uzPhoneDigits('998123456')).toBe('998123456');
  });

  it('местный формат с ведущей «8» при 10 цифрах', () => {
    expect(uzPhoneDigits('8901234567')).toBe('901234567');
    expect(uzPhoneDigits('8 90 123-45-67')).toBe('901234567');
  });

  it('частичный ввод возвращает частичные цифры', () => {
    expect(uzPhoneDigits('+998 90')).toBe('90');
  });

  it('лишние цифры обрезаются до 9', () => {
    expect(uzPhoneDigits('9012345678901')).toBe('901234567');
  });
});

describe('formatUzPhone', () => {
  it('без значащих цифр → пустая строка (виден placeholder)', () => {
    expect(formatUzPhone('')).toBe('');
    expect(formatUzPhone('abc')).toBe('');
    expect(formatUzPhone('+998 ')).toBe('');
  });

  it('частичный ввод форматируется по мере набора', () => {
    expect(formatUzPhone('9')).toBe('+998 9');
    expect(formatUzPhone('90')).toBe('+998 90');
    expect(formatUzPhone('901')).toBe('+998 90 1');
    expect(formatUzPhone('9012345')).toBe('+998 90 123 45');
  });

  it('полный номер: +998 XX XXX XX XX', () => {
    expect(formatUzPhone('901234567')).toBe('+998 90 123 45 67');
    expect(formatUzPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  it('идемпотентен на уже отформатированном значении', () => {
    expect(formatUzPhone('+998 90 123 45 67')).toBe('+998 90 123 45 67');
  });
});

describe('uzPhoneE164', () => {
  it('пусто → пустая строка (не голый +998)', () => {
    expect(uzPhoneE164('')).toBe('');
    expect(uzPhoneE164('abc')).toBe('');
  });

  it('маскированное и сырое значения → +998XXXXXXXXX', () => {
    expect(uzPhoneE164('+998 90 123 45 67')).toBe('+998901234567');
    expect(uzPhoneE164('901234567')).toBe('+998901234567');
  });
});

describe('uzPhoneComplete', () => {
  it('true только при ровно 9 цифрах абонента', () => {
    expect(uzPhoneComplete('')).toBe(false);
    expect(uzPhoneComplete('+998 90 123 45 6')).toBe(false);
    expect(uzPhoneComplete('+998 90 123 45 67')).toBe(true);
    expect(uzPhoneComplete('901234567')).toBe(true);
  });
});
