import { describe, expect, it } from 'vitest';
import { digitsOnly, groupThousands } from './salaryFormat';

describe('digitsOnly', () => {
  it('вырезает всё, кроме цифр', () => {
    expect(digitsOnly('1,400 сум')).toBe('1400');
  });

  it('режет до 13 знаков', () => {
    expect(digitsOnly('123456789012345')).toBe('1234567890123');
  });
});

describe('groupThousands', () => {
  it('группирует тысячи запятыми', () => {
    expect(groupThousands('1400')).toBe('1,400');
    expect(groupThousands('1400000')).toBe('1,400,000');
  });

  it('короткие числа не трогает', () => {
    expect(groupThousands('400')).toBe('400');
    expect(groupThousands('')).toBe('');
  });
});
