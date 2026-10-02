import { normalizeImportPhone } from './contact.util';

describe('normalizeImportPhone', () => {
  it.each([
    ['+998901234567', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['901234567', '+998901234567'],
    ['90 123 45 67', '+998901234567'],
    ['(90) 123-45-67', '+998901234567'],
    ['+998 90 123-45-67', '+998901234567'],
    ['+79161234567', '+79161234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeImportPhone(input)).toBe(expected);
  });

  it('принимает числовую ячейку Excel', () => {
    expect(normalizeImportPhone(998901234567)).toBe('+998901234567');
    expect(normalizeImportPhone(901234567)).toBe('+998901234567');
  });

  it.each([['', null], ['abc', null], ['12345', null], ['8901234567', null]])(
    'отклоняет %s',
    (input, expected) => {
      expect(normalizeImportPhone(input)).toBe(expected);
    },
  );

  it('отклоняет null/undefined', () => {
    expect(normalizeImportPhone(null)).toBeNull();
    expect(normalizeImportPhone(undefined)).toBeNull();
  });
});
