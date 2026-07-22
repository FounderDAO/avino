import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import { authReducer } from './slices/authSlice';
import { identityResetListener } from './identityResetListener';

export const makeStore = () =>
  configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware()
        .prepend(identityResetListener.middleware)
        .concat(baseApi.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
