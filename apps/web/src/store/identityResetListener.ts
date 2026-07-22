import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import { setCredentials, logOut } from './slices/authSlice';

/**
 * identityResetListener — полный сброс RTK Query-кэша при СМЕНЕ ЛИЧНОСТИ.
 *
 * Проблема: кэш RTK Query ключуется по (endpoint + args) и НЕ учитывает
 * пользователя. После смены аккаунта админки (logout+login под другим
 * админом/модератором) `getMe` и admin-запросы с теми же args отдавали
 * закэшированные данные прежнего пользователя. Ни login, ни logout не
 * инвалидировали admin-теги, а `resetApiState` не вызывался нигде.
 *
 * Решение: на смену личности сбрасываем весь api-кэш. `resetApiState` удаляет
 * данные немедленно (в отличие от `invalidateTags`, который оставляет старые
 * данные видимыми до завершения рефетча). Активные подписки автоматически
 * рефетчатся уже с новым токеном.
 *
 * Смена личности ≠ ротация токена: refresh-ротация (baseQuery) переиздаёт
 * креды через отдельный `setTokens` (без user) — его НЕ матчим, чтобы не
 * сбрасывать кэш на каждой ротации. Reset только на:
 *  - login  — `setCredentials` (verifyOtp в admin/login);
 *  - logout — `logOut`.
 */
export const identityResetListener = createListenerMiddleware();

identityResetListener.startListening({
  matcher: isAnyOf(setCredentials, logOut),
  effect: (_action, listenerApi) => {
    listenerApi.dispatch(baseApi.util.resetApiState());
  },
});
