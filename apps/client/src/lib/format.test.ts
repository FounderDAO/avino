/**
 * Тесты форматирования: плюрализация комнат (ICU) + нормализация площади.
 * Используем createTranslator из next-intl с реальными messages/ru.json.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTranslator } from 'next-intl';
import { formatArea, formatRooms, daysOnSite, listingAge, type T } from './format';

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

// ---------------------------------------------------------------------------
// daysOnSite — сколько дней объявление на сайте
// ---------------------------------------------------------------------------
describe('daysOnSite', () => {
  afterEach(() => vi.useRealTimers());

  it('считает целые дни с момента публикации', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    expect(daysOnSite('2026-06-21T00:00:00.000Z')).toBe(5);
  });

  it('возвращает 0 для будущей даты', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    expect(daysOnSite('2026-06-27T00:00:00.000Z')).toBe(0);
  });

  it('возвращает 0 для невалидной даты', () => {
    expect(daysOnSite('not-a-date')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listingAge — компактная единица возраста для бейджа (дни/недели/месяцы/годы)
// ---------------------------------------------------------------------------
describe('listingAge', () => {
  afterEach(() => vi.useRealTimers());

  const at = (daysAgo: number): string => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    return new Date(Date.parse('2026-06-26T00:00:00.000Z') - daysAgo * 86_400_000).toISOString();
  };

  it('моложе суток → null (бейдж «Новое»)', () => {
    expect(listingAge(at(0))).toBeNull();
  });

  it('1–13 дней → дни', () => {
    expect(listingAge(at(1))).toEqual({ unit: 'days', count: 1 });
    expect(listingAge(at(7))).toEqual({ unit: 'days', count: 7 });
    expect(listingAge(at(13))).toEqual({ unit: 'days', count: 13 });
  });

  it('14–29 дней → недели', () => {
    expect(listingAge(at(14))).toEqual({ unit: 'weeks', count: 2 });
    expect(listingAge(at(21))).toEqual({ unit: 'weeks', count: 3 });
    expect(listingAge(at(29))).toEqual({ unit: 'weeks', count: 4 });
  });

  it('30–364 дней → месяцы', () => {
    expect(listingAge(at(30))).toEqual({ unit: 'months', count: 1 });
    expect(listingAge(at(364))).toEqual({ unit: 'months', count: 12 });
  });

  it('от года → годы', () => {
    expect(listingAge(at(365))).toEqual({ unit: 'years', count: 1 });
    expect(listingAge(at(1000))).toEqual({ unit: 'years', count: 2 });
  });
});
