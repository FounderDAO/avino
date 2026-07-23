import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { baseApi } from './api/baseApi';
import { setCredentials, clearCredentials } from './slices/authSlice';

/**
 * identityResetListener — полный сброс RTK Query-кэша при СМЕНЕ ЛИЧНОСТИ.
 *
 * Проблема: кэш RTK Query ключуется по (endpoint + args) и НЕ учитывает
 * пользователя. После logout+login под другим аккаунтом `getMyListings` (и
 * прочие Bearer-запросы с теми же args) отдавали закэшированные данные
 * прежнего пользователя — объявления аккаунта A всплывали в кабинете аккаунта
 * B. Ни login, ни logout не инвалидировали тег `Listing`, а `resetApiState`
 * не вызывался нигде.
 *
 * Решение: на смену личности сбрасываем весь api-кэш. `resetApiState` удаляет
 * данные немедленно (в отличие от `invalidateTags`, который оставляет старые
 * данные видимыми до завершения рефетча — окно утечки). Активные подписки
 * (напр. getMe в SessionBootstrap) автоматически рефетчатся уже с новым токеном.
 *
 * Смена личности ≠ ротация токена: refresh-ротация (baseQuery) переиздаёт
 * креды БЕЗ `user`; сбрасывать кэш на каждой ротации нельзя (лишний рефетч
 * всего на каждой холодной загрузке — ADR-0142). Поэтому reset только на:
 *  - login  — `setCredentials` С `user` (verifyOtp / googleLogin / appleLogin);
 *  - logout — `clearCredentials`.
 */
export const identityResetListener = createListenerMiddleware();

identityResetListener.startListening({
  matcher: isAnyOf(setCredentials, clearCredentials),
  effect: (action, listenerApi) => {
    // Ротация refresh-токена переиздаёт креды без `user` — это тот же
    // пользователь, кэш не трогаем.
    if (setCredentials.match(action) && action.payload.user === undefined) {
      return;
    }
    listenerApi.dispatch(baseApi.util.resetApiState());
  },
});
