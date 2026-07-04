# Toast-уведомления в apps/client (sonner + RTK Query)

Дата: 2026-07-04. Статус: утверждено Team Lead (формат — toast в углу; авто-ошибки + ручные успехи; библиотека — sonner).

## Проблема

Пользователь не понимает, почему действие не сработало или сработало: часть мутаций
показывает ошибку инлайн (LoginModal, TourRequestModal), часть — молча глотает
(`.catch(() => {})` в Tours/UpcomingTourCard, Google/Apple-логин, setMyListingStatus,
deleteSavedSearch). Единого механизма обратной связи нет.

## Решение

### 1. Библиотека

`sonner` (~5kb) — imperative API `toast.success()/toast.error()` вызывается из любого
места, включая Redux-middleware. `<Toaster position="top-center">` монтируется в
`StoreProvider`, стилизуется под токены проекта (surface/ink/border, успех — teal-deep,
ошибка — red).

### 2. Авто-ошибки мутаций

- `store/apiErrorToastMiddleware.ts` — ловит `isRejectedWithValue` для **мутаций**
  RTK Query (queries не тостим — у них свои error/empty-состояния) и эмитит событие
  в модульный bus (`lib/apiErrorToastBus.ts`).
- `components/ApiErrorToasts.tsx` (внутри StoreProvider) подписан на bus, через
  `useTranslations('toasts')` маппит ошибку: известный код (`RATE_LIMITED`) →
  специфичный текст; сетевой сбой (`isNetworkError`) → «Нет соединения»;
  остальное → «Что-то пошло не так».
- Разделение нужно, потому что middleware живёт вне React и не может переводить.

### 3. Suppress-list

Эндпоинты, где ошибка уже показывается инлайн или является фоновым шумом,
перечислены в `SUPPRESSED_ENDPOINTS` middleware:

- инлайн-обработка: requestOtp, verifyOtp, createTourRequest, sendMessage,
  createThread, updateProfile, updateUser, acceptLegalConsent, createListing,
  uploadListingMedia, updateListing, addListingMedia, deleteListingMedia,
  reorderListingMedia, createSavedSearch, updateTourStatus;
- фон/инфраструктура: refresh, logout, registerListingView, registerListingCall,
  markThreadRead, markNotificationRead, markAllNotificationsRead.

Не подавляются (авто-тост закрывает бывшие молчаливые сбои): googleLogin,
appleLogin, addFavorite, removeFavorite, setMyListingStatus, updateSavedSearch,
deleteSavedSearch.

### 4. Ручные success-тосты (+ точечные error там, где endpoint подавлен)

- LoginModal: OTP-вход, Google, Apple → «Вы вошли в аккаунт»;
- Profile: сохранение → тост (инлайн-надпись «Сохранено» удаляется — один паттерн);
- Settings: смена языка → «Настройки сохранены»;
- ListingEdit: успешное сохранение → «Объявление сохранено»;
- MyListings: смена статуса → «Статус объявления обновлён»;
- IncomingTourModal / Tours / UpcomingTourCard: подтверждение/отклонение тура →
  «Тур подтверждён/отклонён»; в Tours/UpcomingTourCard молчаливые catch дополняются
  `toast.error` (endpoint updateTourStatus подавлен в middleware);
- SavedSearches: сохранённый поиск удалён.
- FilterBar: тост НЕ добавляется — кнопка «Сохранить поиск» уже показывает
  состояния «Сохранение…/Сохранено/Ошибка» инлайн (дубль был бы шумом).

Избранное и прочие частые клики не тостим (шумно). ListingNew и TourRequestModal
имеют собственные success-экраны — тосты не добавляются.

### 5. i18n

Namespace `toasts.*` в `messages/{ru,uz,en}.json`. Для uz — проверка на
кириллические двойники.

### 6. Тесты

Vitest: middleware (rejected-мутация эмитит, подавленный endpoint и query — нет,
abort/condition — нет) + ApiErrorToasts (маппинг кода/сети/generic на toast.error).

## Границы

Только `apps/client/`. Один PR. ADR-0123.
