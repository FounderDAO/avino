import { describe, it, expect } from 'vitest';
import reducer, { hydrateCurrency, setCurrency } from './currencySlice';

describe('currencySlice', () => {
  it('defaults to UZS', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ displayCurrency: 'UZS' });
  });
  it('hydrate sets the value', () => {
    expect(reducer(undefined, hydrateCurrency('USD'))).toEqual({ displayCurrency: 'USD' });
  });
  it('setCurrency switches the value', () => {
    const s = reducer({ displayCurrency: 'UZS' }, setCurrency('USD'));
    expect(s.displayCurrency).toBe('USD');
  });
});
