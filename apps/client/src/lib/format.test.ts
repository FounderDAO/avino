/**
 * Тесты форматирования: плюрализация комнат (ICU) + нормализация площади.
 * Используем createTranslator из next-intl с реальными messages/ru.json.
 */
import { describe, it, expect } from 'vitest';
import { createTranslator } from 'next-intl';
import { formatArea, formatRooms, type T } from './format';

// Импортируем реальные messages для настоящей ICU-плюрализации.
import ruMessages from '../../messages/ru.json';
import uzMessages from '../../messages/uz.json';
import enMessages from '../../messages/en.json';

/**
 * Создаёт t-функцию неймспейса units для заданной локали.
 * Приводим к T через unknown: createTranslator возвращает строго типизированный
 * Translator, который совместим с T функционально, но несовместим по параметрам
 * 'key' из-за вывода типа сообщений.
 */
function makeT(locale: string, messages: Record<string, unknown>): T {
  return createTranslator({ locale, messages, namespace: 'units' }) as unknown as T;
}

const tRu = makeT('ru', ruMessages as Record<string, unknown>);
const tUz = makeT('uz', uzMessages as Record<string, unknown>);
const tEn = makeT('en', enMessages as Record<string, unknown>);

// ---------------------------------------------------------------------------
// Плюрализация комнат (RU)
// ---------------------------------------------------------------------------
describe('formatRooms — ru ICU plural', () => {
  it('1 → «1 комната»', () => {
    expect(formatRooms(1, tRu)).toBe('1 комната');
  });

  it('2 → «2 комнаты»', () => {
    expect(formatRooms(2, tRu)).toBe('2 комнаты');
  });

  it('5 → «5 комнат»', () => {
    expect(formatRooms(5, tRu)).toBe('5 комнат');
  });

  it('0 → пусто (falsy guard в formatRooms)', () => {
    // formatRooms возвращает '' для 0 (falsy), не вызывает t()
    expect(formatRooms(0, tRu)).toBe('');
  });

  it('undefined → пусто', () => {
    expect(formatRooms(undefined, tRu)).toBe('');
  });

  it('11 → «11 комнат» (граничный many)', () => {
    expect(formatRooms(11, tRu)).toBe('11 комнат');
  });

  it('21 → «21 комната» (граничный one)', () => {
    expect(formatRooms(21, tRu)).toBe('21 комната');
  });
});

// ---------------------------------------------------------------------------
// Плюрализация комнат (UZ) — одна форма «other»
// ---------------------------------------------------------------------------
describe('formatRooms — uz', () => {
  it('1 → «1 xonali»', () => {
    expect(formatRooms(1, tUz)).toBe('1 xonali');
  });

  it('5 → «5 xonali»', () => {
    expect(formatRooms(5, tUz)).toBe('5 xonali');
  });
});

// ---------------------------------------------------------------------------
// Плюрализация комнат (EN) — one/other
// ---------------------------------------------------------------------------
describe('formatRooms — en', () => {
  it('1 → «1 room»', () => {
    expect(formatRooms(1, tEn)).toBe('1 room');
  });

  it('2 → «2 rooms»', () => {
    expect(formatRooms(2, tEn)).toBe('2 rooms');
  });

  it('5 → «5 rooms»', () => {
    expect(formatRooms(5, tEn)).toBe('5 rooms');
  });
});

// ---------------------------------------------------------------------------
// Нормализация площади (хвостовые нули)
// ---------------------------------------------------------------------------
describe('formatArea — нормализация хвостовых нулей', () => {
  it('«60.00» → «60 м²»', () => {
    expect(formatArea('60.00', tRu)).toBe('60 м²');
  });

  it('«60.50» → «60.5 м²»', () => {
    expect(formatArea('60.50', tRu)).toBe('60.5 м²');
  });

  it('78 (number) → «78 м²»', () => {
    expect(formatArea(78, tRu)).toBe('78 м²');
  });

  it('undefined → пустая строка', () => {
    expect(formatArea(undefined, tRu)).toBe('');
  });

  it('пустая строка → пустая строка', () => {
    expect(formatArea('', tRu)).toBe('');
  });

  it('«60» → «60 м²» (уже без нулей)', () => {
    expect(formatArea('60', tRu)).toBe('60 м²');
  });

  it('«78.50» → «78.5 м²»', () => {
    expect(formatArea('78.50', tRu)).toBe('78.5 м²');
  });
});
