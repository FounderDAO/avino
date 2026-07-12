import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

interface RealtimeState {
  socketConnected: boolean;
}

const initialState: RealtimeState = { socketConnected: false };

const realtimeSlice = createSlice({
  name: 'realtime',
  initialState,
  reducers: {
    setSocketConnected: (state, action: PayloadAction<boolean>) => {
      state.socketConnected = action.payload;
    },
  },
});

export const { setSocketConnected } = realtimeSlice.actions;
export const selectSocketConnected = (state: RootState): boolean =>
  state.realtime.socketConnected;
export default realtimeSlice.reducer;
