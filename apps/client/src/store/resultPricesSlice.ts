/**
 * resultPricesSlice — цены объявлений текущей выдачи /search.
 *
 * `SearchResults` зеркалит сюда пары «цена + валюта» показанного списка
 * (viewport / полигон / страницы), `PriceFilter` строит по ним домен слайдера
 * и гистограмму. Хранятся сырые пары, НЕ конвертированные: тоггл валюты
 * пересчитывает фильтр без обновления списка (образец — territorySlice).
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Currency } from '@/lib/mock/types';

export interface ResultPrice {
  price: number;
  currency: Currency;
}

export interface ResultPricesState {
  prices: ResultPrice[];
}

const initialState: ResultPricesState = { prices: [] };

const resultPricesSlice = createSlice({
  name: 'resultPrices',
  initialState,
  reducers: {
    setResultPrices(state, action: PayloadAction<ResultPrice[]>) {
      state.prices = action.payload;
    },
    clearResultPrices(state) {
      state.prices = [];
    },
  },
});

export const { setResultPrices, clearResultPrices } = resultPricesSlice.actions;

export const selectResultPrices = (state: {
  resultPrices: ResultPricesState;
}): ResultPrice[] => state.resultPrices.prices;

export default resultPricesSlice.reducer;
