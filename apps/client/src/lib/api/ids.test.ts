import { describe, expect, it } from 'vitest';
import { isUuid } from './ids';

describe('isUuid', () => {
  it('accepts UUIDs in any case', () => {
    expect(isUuid('d64bed72-8421-4249-967b-b68d85065dcd')).toBe(true);
    expect(isUuid('D64BED72-8421-4249-967B-B68D85065DCD')).toBe(true);
  });

  it.each(['not-a-uuid', '', 'd64bed72-8421-4249-967b-b68d85065dc', 'd64bed72842142499 67bb68d85065dcd'])('rejects %j', (v) => {
    expect(isUuid(v)).toBe(false);
  });
});
