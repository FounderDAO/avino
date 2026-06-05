import { buildCorsOptions, parseCorsOrigins } from './cors.options';

/**
 * Юнит-тесты CORS-хелперов (TASK-024). main.ts не тестируется напрямую —
 * проверяем чистую логику парсинга origin'ов и сборки опций.
 */
describe('parseCorsOrigins', () => {
  it('возвращает [] для undefined и пустой строки', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins('   ')).toEqual([]);
  });

  it('разбирает CSV и триммит пробелы', () => {
    expect(
      parseCorsOrigins('http://localhost:3000, https://www.avino.uz'),
    ).toEqual(['http://localhost:3000', 'https://www.avino.uz']);
  });

  it('отбрасывает пустые элементы между запятыми', () => {
    expect(parseCorsOrigins('http://localhost:3000,,')).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('дедуплицирует, сохраняя порядок первого вхождения', () => {
    expect(
      parseCorsOrigins('https://a.uz, https://b.uz, https://a.uz'),
    ).toEqual(['https://a.uz', 'https://b.uz']);
  });
});

describe('buildCorsOptions', () => {
  it('использует переданный allowlist как origin без wildcard', () => {
    const origins = ['http://localhost:3000'];
    const options = buildCorsOptions(origins);
    expect(options.origin).toEqual(origins);
    expect(options.origin).not.toBe('*');
  });

  it('включает credentials и пробрасывает X-Request-Id наружу', () => {
    const options = buildCorsOptions(['https://www.avino.uz']);
    expect(options.credentials).toBe(true);
    expect(options.exposedHeaders).toContain('X-Request-Id');
  });

  it('разрешает Authorization и Content-Type, перечисляет методы с OPTIONS', () => {
    const options = buildCorsOptions([]);
    expect(options.allowedHeaders).toEqual(
      expect.arrayContaining(['Authorization', 'Content-Type']),
    );
    expect(options.methods).toEqual(
      expect.arrayContaining(['GET', 'POST', 'OPTIONS']),
    );
  });
});
