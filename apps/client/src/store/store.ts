import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import favoritesReducer from './favoritesSlice';
import currencyReducer from './currencySlice';
import { authReducer } from './slices/authSlice';
import territoryReducer from './territorySlice';

export const makeStore = () =>
  configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      favorites: favoritesReducer,
      currency: currencyReducer,
      auth: authReducer,
      territory: territoryReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
