import { describe, it, expect } from 'vitest';
import reducer, { hydrateCurrency, setCurrency } from './currencySlice';

describe('currencySlice', () => {
  it('defaults to USD', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ displayCurrency: 'USD' });
  });
  it('hydrate sets the value', () => {
    expect(reducer(undefined, hydrateCurrency('UZS'))).toEqual({ displayCurrency: 'UZS' });
  });
  it('setCurrency switches the value', () => {
    const s = reducer({ displayCurrency: 'UZS' }, setCurrency('USD'));
    expect(s.displayCurrency).toBe('USD');
  });
});
