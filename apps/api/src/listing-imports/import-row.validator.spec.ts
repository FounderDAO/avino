import { PropertyType, TransactionType } from '@prisma/client';
import { ImportRowValues } from './import-columns';
import { importRowKey, validateImportRow } from './import-row.validator';

const base: ImportRowValues = {
  phone: '90 123 45 67',
  first_name: 'Али',
  last_name: 'Валиев',
  transaction_type: 'Продажа',
  property_type: 'Квартира',
  title: '2-комнатная на Навои',
  price: '85 000,50',
  currency: 'usd',
  address: 'Ташкент, улица Навои, 12',
  area: '55',
  floor: '3',
  total_floors: '9',
  year_built: '2015',
};

function ok(values: ImportRowValues) {
  const result = validateImportRow(values);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.input;
}

function errors(values: ImportRowValues) {
  const result = validateImportRow(values);
  if (result.ok) throw new Error('expected errors');
  return result.errors.map((e) => `${e.column}:${e.code}`);
}

describe('validateImportRow', () => {
  it('собирает DTO из валидной строки', () => {
    const input = ok(base);
    expect(input.phone).toBe('+998901234567');
    expect(input.firstName).toBe('Али');
    expect(input.dto).toMatchObject({
      transaction_type: TransactionType.SALE,
      property_type: PropertyType.APARTMENT,
      original_language: 'RU',
      price: '85000.50',
      currency: 'USD',
      area: '55',
      floor: 3,
      total_floors: 9,
      year_built: 2015,
      address: 'Ташкент, улица Навои, 12',
      translation: { title: '2-комнатная на Навои' },
    });
  });

  it('принимает коды enum и язык', () => {
    const input = ok({ ...base, transaction_type: 'RENT', language: 'uz' });
    expect(input.dto.transaction_type).toBe(TransactionType.RENT);
    expect(input.dto.original_language).toBe('UZ');
  });

  it('пустые имя/фамилия — null, не ошибка валидатора', () => {
    const input = ok({ ...base, first_name: '', last_name: undefined });
    expect(input.firstName).toBeNull();
    expect(input.lastName).toBeNull();
  });

  it('обязательные поля', () => {
    expect(errors({ ...base, phone: '', title: ' ', price: '', address: '' })).toEqual(
      expect.arrayContaining([
        'phone:REQUIRED',
        'title:REQUIRED',
        'price:REQUIRED',
        'address:REQUIRED',
      ]),
    );
  });

  it('некорректный телефон', () => {
    expect(errors({ ...base, phone: '12345' })).toEqual(['phone:INVALID_PHONE']);
  });

  it('неизвестные значения словарей и не-числа', () => {
    expect(
      errors({ ...base, property_type: 'Гараж', currency: 'EUR', price: 'дорого', floor: '3.5' }),
    ).toEqual(
      expect.arrayContaining([
        'property_type:INVALID_VALUE',
        'currency:INVALID_VALUE',
        'price:INVALID_VALUE',
        'floor:INVALID_VALUE',
      ]),
    );
  });

  it('слишком длинный заголовок', () => {
    expect(errors({ ...base, title: 'я'.repeat(256) })).toEqual(['title:TOO_LONG']);
  });

  it('год постройки обязателен для квартиры и дома', () => {
    expect(errors({ ...base, year_built: '' })).toEqual(['year_built:REQUIRED']);
    expect(
      validateImportRow({ ...base, property_type: 'Коммерция', year_built: '' }).ok,
    ).toBe(true);
  });

  it('площадь: для участка обязательна lot_area, для остальных — area', () => {
    expect(errors({ ...base, area: '' })).toEqual(['area:REQUIRED']);
    expect(
      errors({ ...base, property_type: 'Участок', area: '', year_built: '' }),
    ).toEqual(['lot_area:REQUIRED']);
    expect(
      validateImportRow({
        ...base,
        property_type: 'Участок',
        area: '',
        lot_area: '600',
        year_built: '',
      }).ok,
    ).toBe(true);
  });

  it('координаты — только парой', () => {
    expect(errors({ ...base, latitude: '41.31' })).toEqual(['longitude:REQUIRED']);
    const input = ok({ ...base, latitude: '41,31', longitude: '69.24' });
    expect(input.dto.latitude).toBe('41.31');
  });

  it('удобства разбиваются по запятой', () => {
    expect(ok({ ...base, amenities: 'wifi, parking ,' }).dto.amenities).toEqual([
      'wifi',
      'parking',
    ]);
  });
});

describe('importRowKey', () => {
  it('одинаков при разном написании площади, регистре и пробелах адреса', () => {
    const a = importRowKey(ok(base));
    const b = importRowKey(
      ok({ ...base, area: '55,00', address: '  ташкент,  улица Навои, 12 ', price: '1' }),
    );
    expect(a).toBe(b);
  });

  it('различается по этажу и телефону', () => {
    const a = importRowKey(ok(base));
    expect(importRowKey(ok({ ...base, floor: '4' }))).not.toBe(a);
    expect(importRowKey(ok({ ...base, phone: '901234568' }))).not.toBe(a);
  });

  it('фото попадают в input с позициями', () => {
    const result = validateImportRow({ ...base, photos: 'https://a.uz/1.jpg, 2.jpg' });
    expect(result).toMatchObject({
      ok: true,
      input: {
        photos: [
          { position: 0, source: 'URL', ref: 'https://a.uz/1.jpg' },
          { position: 1, source: 'FILE', ref: '2.jpg' },
        ],
      },
    });
  });

  it('ошибка фото — ошибка строки', () => {
    const result = validateImportRow({ ...base, photos: '1.heic' });
    expect(result).toMatchObject({
      ok: false,
      errors: [{ column: 'photos', code: 'PHOTO_UNSUPPORTED_FORMAT', value: '1.heic' }],
    });
  });

  it('без колонки фото — пустой список', () => {
    expect(validateImportRow(base)).toMatchObject({ ok: true, input: { photos: [] } });
  });
});
