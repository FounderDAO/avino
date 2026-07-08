import { isRejectedWithValue, type Middleware } from '@reduxjs/toolkit';
import { emitApiError } from '@/lib/apiErrorToastBus';

/**
 * Глобальный перехват ошибок мутаций RTK Query → toast (см. спеку
 * docs/superpowers/plans/2026-07-04-client-toast-notifications.md).
 *
 * Тостим только мутации: у queries (поиск, карточки) свои error/empty-состояния,
 * а тост при каждом фоновом рефетче раздражал бы. `isRejectedWithValue`
 * автоматически отсекает abort/condition-отмены (у них нет payload).
 */

/**
 * Эндпоинты без авто-тоста:
 * - ошибка уже показывается инлайн рядом с формой;
 * - либо это фоновая инфраструктура (сессия, трекинг, отметки прочтения),
 *   чьи сбои не должны дёргать пользователя.
 */
export const SUPPRESSED_ENDPOINTS: ReadonlySet<string> = new Set([
  // Инлайн-обработка в UI.
  'requestOtp', // LoginModal
  'verifyOtp', // LoginModal
  'createTourRequest', // TourRequestModal
  'sendMessage', // Inbox
  'createThread', // Inbox / ContactCard
  'updateProfile', // Profile / Settings
  'updateUser', // Profile / Settings
  'uploadAvatar', // Profile (клиентская валидация + ручной toast)
  'deleteAvatar', // Profile (ручной toast)
  'acceptLegalConsent', // LegalConsentModal
  'createListing', // ListingNew
  'uploadListingMedia', // ListingNew (mediaFailures)
  'updateListing', // ListingEdit
  'addListingMedia', // ListingEdit
  'deleteListingMedia', // ListingEdit
  'reorderListingMedia', // ListingEdit
  'updateTourStatus', // IncomingTourModal (инлайн) / Tours, UpcomingTourCard (ручной toast)
  // Фон/инфраструктура.
  'refresh',
  'logout',
  'registerListingView',
  'registerListingCall',
  'markThreadRead',
  'markNotificationRead',
  'markAllNotificationsRead',
]);

/** Форма meta.arg у rejected-экшенов RTK Query (публичный, но нетипизированный контракт). */
interface RtkQueryRejectedMeta {
  arg?: {
    endpointName?: string;
    type?: 'query' | 'mutation';
  };
}

export const apiErrorToastMiddleware: Middleware = () => (next) => (action) => {
  if (isRejectedWithValue(action)) {
    const meta = action.meta as RtkQueryRejectedMeta;
    const endpointName = meta.arg?.endpointName;
    if (
      meta.arg?.type === 'mutation' &&
      endpointName &&
      !SUPPRESSED_ENDPOINTS.has(endpointName)
    ) {
      emitApiError({ endpointName, error: action.payload });
    }
  }
  return next(action);
};
