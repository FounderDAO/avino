import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateListingDto } from './create-listing.dto';

const BASE = {
  transaction_type: 'SALE',
  property_type: 'APARTMENT',
  original_language: 'RU',
  price: '100000.00',
  currency: 'UZS',
  year_built: 2015,
  translation: { title: 'Тест' },
};

function errorsFor(extra: Record<string, unknown>) {
  const inst = plainToInstance(CreateListingDto, { ...BASE, ...extra });
  return validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
}

describe('CreateListingDto — bathrooms (дробные, шаг 0.5)', () => {
  it('принимает целые и половинные значения', () => {
    expect(errorsFor({ bathrooms: 1 })).toHaveLength(0);
    expect(errorsFor({ bathrooms: 1.5 })).toHaveLength(0);
    expect(errorsFor({ bathrooms: 2.5 })).toHaveLength(0);
  });

  it('отклоняет значения, не кратные 0.5', () => {
    expect(errorsFor({ bathrooms: 1.3 }).length).toBeGreaterThan(0);
  });

  it('отклоняет отрицательные и > 99', () => {
    expect(errorsFor({ bathrooms: -0.5 }).length).toBeGreaterThan(0);
    expect(errorsFor({ bathrooms: 99.5 }).length).toBeGreaterThan(0);
  });
});

describe('CreateListingDto — year_built необязателен, но проверяется', () => {
  const hasYearError = (errors: ReturnType<typeof errorsFor>) =>
    errors.some((e) => e.property === 'year_built');

  it.each(['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL'])('%s без year_built → валидно', (pt) => {
    const errors = errorsFor({ property_type: pt, year_built: undefined });
    expect(hasYearError(errors)).toBe(false);
  });

  it('null year_built → валидно', () => {
    expect(hasYearError(errorsFor({ year_built: null }))).toBe(false);
  });

  it('вне диапазона SmallInt или дробный → ошибка', () => {
    expect(hasYearError(errorsFor({ year_built: -1 }))).toBe(true);
    expect(hasYearError(errorsFor({ year_built: 40000 }))).toBe(true);
    expect(hasYearError(errorsFor({ year_built: 2015.5 }))).toBe(true);
  });

  it('будущий год (недострой «сдача в 2028») → валидно', () => {
    const errors = errorsFor({ year_built: new Date().getFullYear() + 2 });
    expect(hasYearError(errors)).toBe(false);
  });

  it('нечисловой year_built отклоняется и для LAND', () => {
    const errors = errorsFor({ property_type: 'LAND', year_built: 'abc' });
    expect(hasYearError(errors)).toBe(true);
  });
});
