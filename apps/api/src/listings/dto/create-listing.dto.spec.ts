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
