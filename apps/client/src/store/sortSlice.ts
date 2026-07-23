/**
 * sortSlice — выбранный порядок сортировки выдачи /search.
 *
 * Сорт — чисто клиентское состояние: `SortControl` пишет сюда, `SearchResults`
 * читает и переупорядочивает УЖЕ загруженный список ({@link sortListings}) без
 * запроса к API (образец — territorySlice/resultPricesSlice). URL (`?sort=`)
 * обновляется отдельно shallow-навигацией — для шаринга и restore saved-search,
 * без RSC-ре-рендера и рефетча.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SortOption } from '@/lib/mock/types';

export interface SortState {
  sort: SortOption;
}

const initialState: SortState = { sort: 'promotion' };

const sortSlice = createSlice({
  name: 'sort',
  initialState,
  reducers: {
    /** Восстановить сорт из URL (`?sort=`) при заходе на страницу. */
    hydrateSort(state, action: PayloadAction<SortOption>) {
      state.sort = action.payload;
    },
    /** Сменить сорт (клиентское переупорядочивание, без запроса). */
    setSort(state, action: PayloadAction<SortOption>) {
      state.sort = action.payload;
    },
  },
});

export const { hydrateSort, setSort } = sortSlice.actions;

export const selectSort = (state: { sort: SortState }): SortOption =>
  state.sort.sort;

export default sortSlice.reducer;
