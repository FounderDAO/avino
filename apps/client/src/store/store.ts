import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from './api/baseApi';
import { apiErrorToastMiddleware } from './apiErrorToastMiddleware';
import favoritesReducer from './favoritesSlice';
import currencyReducer from './currencySlice';
import { authReducer } from './slices/authSlice';
import territoryReducer from './territorySlice';
import resultPricesReducer from './resultPricesSlice';

export const makeStore = () => {
  const store = configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      favorites: favoritesReducer,
      currency: currencyReducer,
      auth: authReducer,
      territory: territoryReducer,
      resultPrices: resultPricesReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware, apiErrorToastMiddleware),
  });
  // Трекинг фокуса/сети окна — без него skipPollingIfUnfocused (шапка) не
  // приостанавливает поллинг в фоне. На сервере setupListeners — no-op.
  setupListeners(store.dispatch);
  return store;
};

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
