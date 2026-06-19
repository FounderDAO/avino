import { parseCbuUsdRate } from './cbu.provider';

describe('parseCbuUsdRate', () => {
  it('extracts Rate from the CBU USD array payload', () => {
    const payload = [
      { id: 69, Code: '840', Ccy: 'USD', Rate: '12650.18', Date: '19.06.2026' },
    ];
    expect(parseCbuUsdRate(payload)).toBe('12650.18');
  });

  it('throws when payload is not a non-empty array', () => {
    expect(() => parseCbuUsdRate([])).toThrow();
    expect(() => parseCbuUsdRate({})).toThrow();
  });

  it('throws when Rate is missing or not numeric', () => {
    expect(() => parseCbuUsdRate([{ Ccy: 'USD' }])).toThrow();
    expect(() => parseCbuUsdRate([{ Ccy: 'USD', Rate: 'abc' }])).toThrow();
  });
});
