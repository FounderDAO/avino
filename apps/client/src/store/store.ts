import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { baseApi } from './api/baseApi';
import favoritesReducer from './favoritesSlice';
import currencyReducer from './currencySlice';
import { authReducer } from './slices/authSlice';
import territoryReducer from './territorySlice';

export const makeStore = () => {
  const store = configureStore({
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
  // Трекинг фокуса/сети окна — без него skipPollingIfUnfocused (шапка) не
  // приостанавливает поллинг в фоне. На сервере setupListeners — no-op.
  setupListeners(store.dispatch);
  return store;
};

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
