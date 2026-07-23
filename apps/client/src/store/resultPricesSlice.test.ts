import { describe, it, expect } from 'vitest';
import reducer, { setResultPrices, clearResultPrices } from './resultPricesSlice';

describe('resultPricesSlice', () => {
  it('defaults to empty prices array', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ prices: [] });
  });

  it('setResultPrices сохраняет пары цена+валюта', () => {
    const next = reducer({ prices: [] }, setResultPrices([{ price: 88800, currency: 'USD' }]));
    expect(next.prices).toEqual([{ price: 88800, currency: 'USD' }]);
  });

  it('clearResultPrices очищает список', () => {
    const next = reducer({ prices: [{ price: 1, currency: 'USD' }] }, clearResultPrices());
    expect(next.prices).toEqual([]);
  });
});
