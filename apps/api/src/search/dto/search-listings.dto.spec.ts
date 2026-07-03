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

  it('парсит is_basement из query-строки', () => {
    expect(dto({ is_basement: 'true' }).inst.is_basement).toBe(true);
    expect(dto({ is_basement: 'false' }).inst.is_basement).toBe(false);
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

  it('принимает amenities=POOL (бассейн, мобилка #5)', () => {
    const { inst, errors } = dto({ amenities: 'POOL' });
    expect(errors).toHaveLength(0);
    expect(inst.amenities).toEqual(['POOL']);
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

  it.each(['1', '1.5', '2', '3', '4'])('принимает bathrooms_min=%s', (v) => {
    const { inst, errors } = dto({ bathrooms_min: v });
    expect(errors).toHaveLength(0);
    expect(inst.bathrooms_min).toBe(Number(v));
  });

  it.each(['2.5', '3.5', '1.3', '0', '5'])('отклоняет bathrooms_min=%s (вне набора 1/1.5/2/3/4)', (v) => {
    const { errors } = dto({ bathrooms_min: v });
    expect(errors.length).toBeGreaterThan(0);
  });
});
