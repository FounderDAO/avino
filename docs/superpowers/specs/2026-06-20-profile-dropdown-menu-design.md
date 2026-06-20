# Профиль-меню (OLX-style dropdown) после логина — design

**Дата:** 2026-06-20
**Область:** `apps/client` (публичный портал)
**Ветка:** `feat/client-profile-dropdown-menu`

## Проблема

Сейчас в шапке (`apps/client/src/components/layout/Header.tsx`) залогиненное
состояние = текстовая ссылка с именем пользователя (напр. «Камила Назарова») +
отдельная кнопка «Выйти». Нужно заменить это на компактное профиль-меню в стиле
OLX: триггер «Ваш профиль» с шевроном, по клику — выпадающая панель с пунктами
аккаунта и блоком «Избранные».

**Явные требования пользователя:**
- Имя/фамилия НЕ показываются нигде (ни в триггере, ни в шапке панели).
- Пункты, которых нет в Avino (OLX «Платежи и счёт OLX», «Ищу работу»), не
  переносим.
- Это редизайн под существующий дизайн OLX, без новой бэкенд-функциональности.

## Решения (подтверждены пользователем)

1. **Шапка панели** — «Только контакт»: аватар + одна жирная строка-контакт.
   Без строки `id` (id у нас — длинный UUID, выглядит мусором).
2. **Набор пунктов** — «+ Профиль»: Профиль, Объявления, Чат, Настройки, затем
   секция «Избранные:» (Объявления / Поиски), затем «Выйти».

## Подход

Из 3 вариантов выбран **вынос отдельного компонента `ProfileMenu`**, который
переиспользует существующий Radix-примитив `Dropdown`
(`apps/client/src/components/ui/dropdown.tsx`, тот же, что у `LangSwitcher`).

- Не инлайнить в `Header.tsx` → шапка остаётся тонкой, меню юнит-тестируемо.
- Не писать свой popover → примитив уже даёт focus-trap, outside-click,
  клавиатурную навигацию.

## Архитектура и компоненты

### Новый компонент `ProfileMenu.tsx`

Расположение: `apps/client/src/components/layout/ProfileMenu.tsx`.
Самодостаточный — сам читает auth-состояние, счётчики и владеет logout/навигацией.

**Зависимости (всё уже существует):**
- `selectIsAuthenticated`, `selectCurrentUser`, `selectRefreshToken` из
  `@/store/slices/authSlice`
- `useLogoutMutation` из `@/store/api/authApi`
- `useFavoritesCount` из `@/store/favorites`
- `useGetSavedSearchesQuery` из `@/store/api/savedSearchesApi`
- `Dropdown`, `DropdownTrigger`, `DropdownContent`, `DropdownItem` из
  `@/components/ui/dropdown`
- `useTranslations('nav')` (next-intl), `useRouter` (next-intl навигация, как в
  Header)
- иконки `User`, `ChevronDown` (lucide-react)

**Триггер** (заменяет в залогиненной ветке Header ссылку-имя + кнопку «Выйти»):
- `<User/>` + текст `t('profileMenu.trigger')` («Ваш профиль») + `<ChevronDown/>`.
- Стилизован под существующие ghost-кнопки шапки (`text-[15px]`).
- **Имя не выводится.**

**Панель (`DropdownContent`, align=end):**

```
┌──────────────────────────┐
│  ◍  taplinksuz           │  блок идентичности
├──────────────────────────┤
│  Ваш профиль             │  label секции (muted)
│  Профиль                 │  → /account/profile
│  Объявления              │  → /account/my-listings
│  Чат                     │  → /account/inbox
│  Настройки               │  → /account/settings
│  Избранные:              │  label секции (muted)
│  Объявления          (0) │  → /account/favorites
│  Поиски              (0) │  → /account/saved
├──────────────────────────┤
│  Выйти                   │  → handleLogout
└──────────────────────────┘
```

**Блок идентичности:**
- Аватар: `currentUser.profile.avatar_url` → `<img>`; иначе круг с первой буквой
  контакта (брендовый mint-фон). Маленький подкомпонент/инлайн внутри
  `ProfileMenu`.
- Жирная строка-контакт через хелпер `contactLabel(currentUser)`:
  `email` есть → локальная часть до `@`; иначе `phone`; иначе `t('account')`.
  **Намеренно НЕ используем `display_name`/`first_name`** — чтобы не утекло имя
  (требование «без имя фамилья»).

**Пункты и навигация:**
- Каждый пункт = `DropdownItem` c `onSelect={() => router.push(href)}` (паттерн как
  у `LangSwitcher`). Если у `DropdownItem` есть поддержка `asChild` —
  предпочесть `next-intl` `<Link>` ради middle-click / open-in-new-tab; иначе
  `router.push`. Уточняется на этапе плана чтением `dropdown.tsx`.
- Лейблы-секции «Ваш профиль» и «Избранные:» — не кликабельные подписи (muted),
  не `DropdownItem`.

**Счётчики (серая пилюля, показываем даже при 0 — как в OLX):**
- Избранное: `useFavoritesCount()`.
- Поиски: `useGetSavedSearchesQuery(undefined, { skip: !isAuthenticated })` →
  `data?.length ?? 0`.
- Все count-запросы гардятся `skip`-ом при отсутствии auth (внутри меню мы всегда
  залогинены, но `skip` оставляем как защиту).

**Logout:** логика `handleLogout` (сейчас в Header) переезжает в `ProfileMenu`:
`await logout({ refresh_token: refreshToken ?? '' })` → `finally router.push('/')`.

### Правки `Header.tsx`

- Залогиненная ветка (текущие строки ~138–150: ссылка-имя + кнопка «Выйти»)
  заменяется на `<ProfileMenu />`.
- Из Header удаляются ставшие лишними: `handleLogout`, `accountLabel`,
  импорт `useLogoutMutation` (если больше нигде в Header не нужен — проверить).
- Мобильное полноэкранное меню: залогиненные ссылки приводятся к тому же набору
  назначений (Профиль, Объявления, Чат, Настройки, Избранное, Поиски, Выйти) для
  консистентности. Десктоп-дропдаун — основной деливерабл; мобайл — паритет
  пунктов, без отдельного дропдауна.

### i18n

Новый блок `nav.profileMenu.*` в `messages/{ru,uz,en}.json` (полный паритет 3
языков). Берём короткие OLX-лейблы, а не длинные `account.tabs.*`.

| ключ | ru | uz | en |
|------|----|----|----|
| `profileMenu.trigger` | Ваш профиль | Profilingiz | Your profile |
| `profileMenu.sectionMain` | Ваш профиль | Profilingiz | Your profile |
| `profileMenu.profile` | Профиль | Profil | Profile |
| `profileMenu.listings` | Объявления | E'lonlar | Listings |
| `profileMenu.chat` | Чат | Chat | Chat |
| `profileMenu.settings` | Настройки | Sozlamalar | Settings |
| `profileMenu.favorites` | Избранные: | Saqlanganlar: | Saved: |
| `profileMenu.favListings` | Объявления | E'lonlar | Listings |
| `profileMenu.favSearches` | Поиски | Qidiruvlar | Searches |

«Выйти» переиспользует существующий `nav.logout`.

## Поток данных

1. `Header` рендерит `<ProfileMenu/>` только в залогиненной ветке
   (`isAuthenticated`).
2. `ProfileMenu` читает `currentUser` из стора → формирует аватар + контакт.
3. Счётчики тянутся RTK Query хуками (favorites/saved), отображаются пилюлями.
4. Клик по пункту → `router.push(href)` → Radix сам закрывает меню.
5. «Выйти» → `logout` мутация (чистит креды в `onQueryStarted`) → редирект на `/`.

## Обработка ошибок / краевые случаи

- Нет `avatar_url` → инициал-круг (фолбэк всегда есть).
- Нет email и нет phone → контакт = `t('account')` («Аккаунт»).
- Счётчики не загрузились / undefined → показываем `0`.
- Гость (не должно случаться для этого компонента) → `ProfileMenu` не рендерится
  (ветка `isAuthenticated` в Header).

## Тестирование

`apps/client/src/components/layout/ProfileMenu.test.tsx` (Vitest + RTL, харнесс
уже есть):
- триггер рендерит «Ваш профиль», без имени;
- открытие меню показывает все пункты (Профиль/Объявления/Чат/Настройки/
  Избранные: Объявления/Поиски/Выйти);
- счётчики отображаются (мок хуков → пилюли с числом);
- контакт = локальная часть email (мок currentUser с email);
- клик «Выйти» вызывает logout-мутацию.

`pnpm --filter @avino/client test` + `pnpm --filter @avino/client lint` +
сборка должны быть зелёными.

## Вне области (YAGNI)

- Никакого нового бэкенда.
- Нет пунктов «Платежи», «Ищу работу».
- Нет «Уведомления» в дропдауне — для них уже есть колокольчик в шапке.
- Никакой загрузки/редактирования аватара.
- Кросс-валютные/прочие несвязанные правки шапки.

## Затронутые файлы

- **new** `apps/client/src/components/layout/ProfileMenu.tsx`
- **new** `apps/client/src/components/layout/ProfileMenu.test.tsx`
- **edit** `apps/client/src/components/layout/Header.tsx`
- **edit** `apps/client/messages/ru.json`, `uz.json`, `en.json`
