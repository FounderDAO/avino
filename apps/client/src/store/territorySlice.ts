/**
 * territorySlice — нарисованная территория (полигон) для сохранённого поиска.
 *
 * `SearchResults` рисует полигон в локальном стейте и зеркалит сюда сериализованное
 * кольцо (`lat,lng;…`); `FilterBar` читает его при «Сохранить поиск», чтобы положить
 * `points` в `filters_json.filters`. Только для сохранения — сам поиск по карте
 * по-прежнему ведётся из локального стейта `SearchResults`.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface TerritoryState {
  points: string | null;
}

const initialState: TerritoryState = { points: null };

const territorySlice = createSlice({
  name: 'territory',
  initialState,
  reducers: {
    setTerritory(state, action: PayloadAction<string | null>) {
      state.points = action.payload;
    },
    clearTerritory(state) {
      state.points = null;
    },
  },
});

export const { setTerritory, clearTerritory } = territorySlice.actions;

export const selectTerritoryPoints = (state: {
  territory: TerritoryState;
}): string | null => state.territory.points;

export default territorySlice.reducer;
