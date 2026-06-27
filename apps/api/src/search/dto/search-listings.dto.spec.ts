import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SearchListingsQueryDto } from './search-listings.dto';

function dto(obj: Record<string, unknown>) {
  const inst = plainToInstance(SearchListingsQueryDto, obj, {
    enableImplicitConversion: true,
  });
  return { inst, errors: validateSync(inst) };
}

describe('SearchListingsQueryDto — Zillow filters', () => {
  it('нормализует одиночный property_type в массив', () => {
    const { inst, errors } = dto({ property_type: 'APARTMENT' });
    expect(errors).toHaveLength(0);
    expect(inst.property_type).toEqual(['APARTMENT']);
  });

  it('принимает массив property_type', () => {
    const { inst, errors } = dto({ property_type: ['APARTMENT', 'HOUSE'] });
    expect(errors).toHaveLength(0);
    expect(inst.property_type).toEqual(['APARTMENT', 'HOUSE']);
  });

  it('отклоняет неизвестный property_type', () => {
    const { errors } = dto({ property_type: ['NOPE'] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('парсит rooms_min/floor_min/year_min как числа', () => {
    const { inst, errors } = dto({ rooms_min: '2', floor_min: '3', year_min: '2010' });
    expect(errors).toHaveLength(0);
    expect(inst.rooms_min).toBe(2);
    expect(inst.floor_min).toBe(3);
    expect(inst.year_min).toBe(2010);
  });

  it('парсит булевы флаги из query-строк', () => {
    const { inst } = dto({ not_first_floor: 'true', tours_enabled: 'true', not_last_floor: 'false' });
    expect(inst.not_first_floor).toBe(true);
    expect(inst.tours_enabled).toBe(true);
    expect(inst.not_last_floor).toBe(false);
  });

  it('нормализует listing_source в массив и валидирует значения', () => {
    expect(dto({ listing_source: 'OWNER' }).inst.listing_source).toEqual(['OWNER']);
    expect(dto({ listing_source: ['OWNER', 'AGENCY'] }).errors).toHaveLength(0);
    expect(dto({ listing_source: ['BANK'] }).errors.length).toBeGreaterThan(0);
  });

  it('принимает валидный массив amenities', () => {
    const { inst, errors } = dto({ amenities: ['ELEVATOR', 'HEATING'] });
    expect(errors).toHaveLength(0);
    expect(inst.amenities).toEqual(['ELEVATOR', 'HEATING']);
  });

  it('отклоняет невалидное значение amenities', () => {
    const { errors } = dto({ amenities: ['NOPE'] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('нормализует одиночный amenities в массив (toArray)', () => {
    const { inst, errors } = dto({ amenities: 'ELEVATOR' });
    expect(errors).toHaveLength(0);
    expect(inst.amenities).toEqual(['ELEVATOR']);
  });
});
