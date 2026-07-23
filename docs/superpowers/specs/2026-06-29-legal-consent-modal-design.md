# Design — Согласие с Правилами и Политикой (legal consent modal)

**Дата:** 2026-06-29
**Статус:** Approved (дизайн)
**Затрагивает:** apps/api, apps/web, apps/client (+ Prisma migration)

## 1. Контекст и цель

Юр-страницы `/[locale]/legal/terms` и `/[locale]/legal/privacy` уже существуют (PR #264).
Нужно при первом входе пользователя показать **блокирующую** модалку с двумя
галочками (Правила, Политика), зафиксировать факт согласия и сделать само
требование **управляемым из админ-панели** (вкл/выкл).

### Зафиксированные решения (brainstorming 2026-06-29)

| Вопрос | Решение |
|--------|---------|
| Кому показывать / где хранить | Только **вошедшим**; согласие — на сервере, привязано к аккаунту |
| Версионность | **Да** — храним версию принятых документов; при изменении админ поднимает версию → повторное согласие |
| Поведение модалки | **Блокирующая** — нельзя закрыть, пока не отмечены обе галочки и не нажато «Согласен» |
| Дефолт admin-флага | **ВЫКЛ** (fail-safe, как `promotions`/`map-hover`); env-override |
| Источник «текущей версии» | **Вариант A** — версия как admin-поле в `app_settings` (дефолт `1`); управляется из панели без передеплоя |

### Поведенческая матрица

| Состояние | Модалка |
|-----------|---------|
| Гость (не вошёл) | Нет (согласие негде хранить; увидит после входа) |
| Вошёл + флаг OFF | Нет |
| Вошёл + флаг ON + `accepted_version >= current_version` | Нет |
| Вошёл + флаг ON + не соглашался / `accepted_version < current_version` | **Блокирующая модалка** |

## 2. Модель данных (apps/api)

Отдельная **append-only** таблица — юридически чистый аудит-след (каждое согласие
= строка); «текущая принятая версия» = `MAX(version)` по пользователю.

```prisma
model LegalConsent {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  version    Int      // версия документов на момент согласия
  acceptedAt DateTime @default(now()) @map("accepted_at") @db.Timestamptz(6)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("legal_consents")
}
```

- На `User` добавляется relation `legalConsents LegalConsent[]`.
- Миграция — raw SQL (как принято в проекте; `prisma migrate dev` workaround
  `db execute` + `migrate resolve` при необходимости).
- Две галочки в UI — требование к **презентации** согласия; в хранилище это одно
  событие «принял Правила+Политику версии N». Per-document версии — YAGNI
  (заложим, только если документы начнут версионироваться независимо).
- Параллельно пишем в существующий `audit_log`:
  `action: 'LEGAL_CONSENT_ACCEPTED'`, `metadata: { version }`.

## 3. Флаги (apps/api / settings)

Зеркалим `PromotionsFlagService` → `LegalConsentFlagService` поверх `app_settings`:

- ключ `legal_consent_required` → bool, дефолт `false` (env `legalConsent.required`),
  чистый резолвер по образцу `resolvePromotionsEnabled`;
- ключ `legal_consent_version` → int, дефолт `1` (env `legalConsent.version`).

API сервиса: `isRequired()`, `currentVersion()`, `setRequired(adminId, bool)`,
`setVersion(adminId, int)` — запись в `app_settings` + `audit_log`.

`PublicSettingsView` (`GET /api/v1/settings/public`) расширяется **двумя полями**:
`legalConsentRequired: boolean`, `legalConsentVersion: number` (точка расширения —
поле, не новый эндпоинт). Сервис экспортируется из `SettingsModule`.

Admin-запись: `AdminLegalConsentFlagController`
(`GET`/`PATCH /api/v1/admin/settings/legal-consent`) регистрируется в `AdminModule`,
чтобы его DTO не просачивались в публичный OpenAPI (как `AdminPromotionsFlagController`).

## 4. Эндпоинты (apps/api)

### `POST /api/v1/users/me/legal-consent` (Bearer)

Тело: `{ terms_accepted: boolean, privacy_accepted: boolean }`.

- оба `true` → вставка `LegalConsent` с текущей `legal_consent_version` + audit-log,
  ответ `200` с актуальным состоянием `{ accepted_version, accepted_at }` (та же
  форма, что в `/auth/me`). Клиент дополнительно инвалидирует `Auth`/`User` →
  `getMe` перечитывается;
- иначе → `422 CONSENT_INCOMPLETE`.

Живёт в `users`-модуле рядом с `/users/me/profile`
(`LegalConsentService` или метод в `UsersService`).

### `GET /api/v1/auth/me` — расширение

`MeResponse` дополняется полем:

```ts
legal_consent: {
  accepted_version: number | null;
  accepted_at: string | null;   // ISO; null если ни разу не соглашался
}
```

Резолвится из последней строки `legal_consents` пользователя.

## 5. Публичный портал (apps/client)

- `store/api/publicSettingsApi.ts` — `PublicSettings += { legalConsentRequired, legalConsentVersion }`.
- `store/api/authApi.ts` — `MeResponse += legal_consent`.
- `store/api/usersApi.ts` — мутация `acceptLegalConsent` → `POST /users/me/legal-consent`,
  `invalidatesTags: ['Auth','User']`.
- `lib/useLegalConsentGate.ts` — хук, возвращает признак показа:
  `isAuthenticated && publicSettings.legalConsentRequired &&
   (me.legal_consent == null || me.legal_consent.accepted_version < publicSettings.legalConsentVersion)`.
  Fail-safe: при загрузке/ошибке настроек — `false` (не блокируем зря).
- `components/layout/LegalConsentModal.tsx` — блокирующий `Dialog` (radix, в
  `Dialog.Portal`, как `LoginModal`): **без крестика, без закрытия по клику вне и Esc**
  (`onPointerDownOutside`/`onEscapeKeyDown` → `preventDefault`); оверлей перекрывает
  портал. Две галочки; в подписях — ссылки `/[locale]/legal/terms` и
  `/[locale]/legal/privacy` (`target=_blank`, чтобы не потерять модалку). Кнопка
  «Согласен» `disabled`, пока не отмечены обе. Ошибка/loading мутации — как в `LoginModal`.
- Монтируется один раз в авторизованной зоне (клиентский `LegalConsentGate` в
  locale-layout / providers), чтобы перекрывать любую страницу.
- i18n-ключи `legalConsent.*` на ru/uz/en (заголовок, подписи галочек со ссылками,
  кнопка, ошибки).

## 6. Админка (apps/web)

- `store/api/adminLegalConsentFlagApi.ts` — `GET`/`PATCH`
  (`{ legalConsentRequired, legalConsentVersion }`).
- `components/admin/LegalConsentRequiredToggle.tsx` — тумблер «Требовать согласие»
  + поле «Текущая версия документов» (зеркалит `PromotionsAvailabilityToggle`).
- Монтируется на `app/admin/settings/page.tsx` рядом с прочими тогглами.
- Дисциплина (в подсказке компонента): подняли юр-тексты → поднимите версию,
  чтобы пользователи согласились заново.

## 7. Разбивка на PR (правило «одна app-папка = один PR»)

| # | Ветка | Папка | Содержимое | Зависит от |
|---|-------|-------|-----------|------------|
| 1 | `feat/api-legal-consent` | apps/api | модель + миграция, флаги, эндпоинт, `/auth/me`, тесты, openapi regen | — |
| 2 | `feat/web-legal-consent-toggle` | apps/web | admin-тумблер + версия | №1 |
| 3 | `feat/client-legal-consent-modal` | apps/client | модалка, хук, wiring, i18n, тесты | №1 |

Порядок мёржа: **№1 → затем №2 и №3 параллельно.**

## 8. ADR / трекинг

- Новый ADR (формат проекта): `docs/adr/ADR-0115-legal-consent-modal.md` —
  решение о per-user server-stored versioned consent + admin-gated требовании.
- `docs/TASKS.md` → `docs/DONE.md` по мере мёржа PR (ADR/DONE готовятся внутри
  feature-PR, без отдельной follow-up PR).
- `openapi.public.json` / `openapi.internal.json` — регенерация
  (`pnpm openapi:export`) после изменения публичных полей/эндпоинтов.

## 9. Вне scope (YAGNI)

- Независимое версионирование Правил vs Политики (отдельные версии на документ).
- Согласие для гостей / хранение в cookie/localStorage.
- Принудительная синхронизация версии с задеплоенным текстом (версия — admin-поле,
  дисциплина ручная).
- Сбор IP/User-Agent в строке согласия (можно добавить позже в `legal_consents`).
