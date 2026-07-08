# Web admin: тоггл «Требовать согласие» + версия документов — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать админу в `apps/web` runtime-управление требованием согласия с Правилами+Политикой (вкл/выкл) и текущей версией юр-документов — без пересборки, поверх уже мёрженного бэкенда (PR #265, ADR-0115).

**Architecture:** RTK Query-слайс поверх `adminApi` (`GET`/`PATCH /admin/legal-consent-flag`) + один клиентский компонент-island `LegalConsentRequiredToggle`, смонтированный на `app/admin/settings/page.tsx` рядом с прочими тогглами. Зеркалит `adminPromotionsFlagApi` + `PromotionsAvailabilityToggle` (тоггл) и `ExchangeRatePanel` (числовой ввод + сохранить).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, RTK Query (`@reduxjs/toolkit`). Стили — существующие admin-классы (`a-card`, `a-field`, `abtn`, `abtn-primary`, `row gap-16`, CSS-переменные `--muted`).

## Global Constraints

- **Только `apps/web/`** (+ корневые `docs/`: ADR-0115, DONE.md). Не трогать `apps/api`/`apps/client`/`packages/shared` (CLAUDE.md §0).
- **Никаких `fetch()`/`axios` в компонентах** — только RTK Query через `adminApi` (CLAUDE.md §4).
- **i18n в admin-панели НЕТ** — хардкод RU-строк, как в соседних тогглах.
- **Реальный контракт бэкенда (источник правды — мёрженный код, не дизайн-спека §6):**
  - `GET /admin/legal-consent-flag` → `{ legalConsentRequired: boolean, legalConsentVersion: number }`
  - `PATCH /admin/legal-consent-flag`, тело `{ required?: boolean, version?: number }` → возвращает **перечитанный** вид `{ legalConsentRequired, legalConsentVersion }`
  - валидация версии на бэке: `@IsInt() @Min(1)` — зеркалим на клиенте (целое ≥ 1).
  - baseUrl `adminApi` уже добавляет `/api/v1` (соседние слайсы шлют относительный `/admin/...`).
- **Дефолт «выключено» ничего не меняет** — `required` дефолтит `false`, тоггл показывает «Выключено», PATCH не шлётся, пока админ не нажмёт.
- **Тестов в `apps/web` НЕТ** (`package.json`: `"test": "echo \"no tests yet\""`, нет vitest/jest; у `PromotionsAvailabilityToggle`/`MapHoverRecenterToggle` тестов нет). Поднимать тест-фреймворк — вне scope (нессанкционированное изменение инфры, CLAUDE.md §13). Верификация каждой задачи — `tsc --noEmit` + `lint`; финал — `next build`. Это ровно тот путь, которым шипались соседние тумблеры.
- **Git ведёт контроллер.** Субагенты пишут только код/доки и НЕ выполняют git-команд (CLAUDE.md §15).

---

## File Structure

- **Create** `apps/web/src/store/api/adminLegalConsentFlagApi.ts` — RTK Query-слайс (1 query + 1 mutation), зеркало `adminPromotionsFlagApi.ts`.
- **Create** `apps/web/src/components/admin/LegalConsentRequiredToggle.tsx` — client-island: тоггл «Требовать согласие» + блок «Текущая версия документов» (инпут + «Сохранить версию»).
- **Modify** `apps/web/src/app/admin/settings/page.tsx` — импорт + монтаж компонента рядом с `PromotionsAvailabilityToggle`/`MapHoverRecenterToggle`.
- **Modify** `docs/adr/ADR-0115-legal-consent-modal.md` — секция follow-up (PR №2 отгружен).
- **Modify** `docs/DONE.md` — запись о выполненной задаче.

---

### Task 1: RTK Query слайс `adminLegalConsentFlagApi`

**Files:**
- Create: `apps/web/src/store/api/adminLegalConsentFlagApi.ts`

**Interfaces:**
- Consumes: `adminApi` из `./adminApi` (инъекция эндпоинтов; тег `Admin` уже в `baseApi.tagTypes`).
- Produces:
  - `interface LegalConsentFlag { legalConsentRequired: boolean; legalConsentVersion: number }`
  - хук `useGetLegalConsentFlagQuery(): { data?: LegalConsentFlag; isLoading: boolean }`
  - хук `useUpdateLegalConsentFlagMutation(): [ (body: { required?: boolean; version?: number }) => ..., { isLoading: boolean } ]`

- [ ] **Step 1: Создать файл слайса**

Зеркалит `adminPromotionsFlagApi.ts` 1:1, но с двумя полями ответа и опциональным телом PATCH. PATCH-ответ — тот же `LegalConsentFlag` (бэк перечитывает состояние), `invalidatesTags: ['Admin']` гарантирует, что GET перечитается после переключения.

```ts
import { adminApi } from './adminApi';

export interface LegalConsentFlag {
  legalConsentRequired: boolean;
  legalConsentVersion: number;
}

/**
 * adminLegalConsentFlagApi — runtime-управление согласием с юр-документами (ADMIN).
 * GET/PATCH /admin/legal-consent-flag. PATCH принимает любое подмножество полей
 * (required / version) и возвращает перечитанное состояние; инвалидирует тег Admin,
 * поэтому GET перечитывается после изменения. Зеркалит adminPromotionsFlagApi.
 */
export const adminLegalConsentFlagApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getLegalConsentFlag: build.query<LegalConsentFlag, void>({
      query: () => ({ url: '/admin/legal-consent-flag' }),
      providesTags: ['Admin'],
    }),
    updateLegalConsentFlag: build.mutation<
      LegalConsentFlag,
      { required?: boolean; version?: number }
    >({
      query: (body) => ({
        url: '/admin/legal-consent-flag',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetLegalConsentFlagQuery,
  useUpdateLegalConsentFlagMutation,
} = adminLegalConsentFlagApi;
```

- [ ] **Step 2: Типчек**

Run: `pnpm --filter @avino/web exec tsc --noEmit`
Expected: без ошибок (0 errors). Если падает ~37 cryptic TS-ошибок — это устаревший Prisma-клиент после смены ветки: `pnpm --filter @avino/api exec prisma generate`, затем повторить.

- [ ] **Step 3: Линт**

Run: `pnpm --filter @avino/web lint`
Expected: без ошибок по новому файлу.

- [ ] **Step 4: (Контроллер) коммит**

```bash
git add apps/web/src/store/api/adminLegalConsentFlagApi.ts
git commit -m "feat(web): add adminLegalConsentFlagApi RTK Query slice"
```

---

### Task 2: Компонент `LegalConsentRequiredToggle`

**Files:**
- Create: `apps/web/src/components/admin/LegalConsentRequiredToggle.tsx`

**Interfaces:**
- Consumes: `useGetLegalConsentFlagQuery`, `useUpdateLegalConsentFlagMutation` из `@/store/api/adminLegalConsentFlagApi` (Task 1).
- Produces: именованный экспорт `LegalConsentRequiredToggle` (React-компонент без пропсов).

**Поведение:**
- Тоггл «Требовать согласие» — кнопка зеркалит `PromotionsAvailabilityToggle`: `required ? 'abtn abtn-primary' : 'abtn'`, текст «Включено»/«Выключено», `onClick → update({ required: !required })`.
- Блок «Текущая версия документов»: показывает текущую версию; инпут (локальный `draft`) + кнопка «Сохранить версию» → `update({ version })`. Кнопка `disabled`, пока `draft` не валиден (целое ≥ 1) — зеркалит `@IsInt() @Min(1)` бэка и идиому `ExchangeRatePanel` (локальный draft, очистка после сохранения).
- Подсказка о дисциплине версий (дизайн-спека §6): подняли юр-тексты → поднимите версию, пользователи согласятся заново.

- [ ] **Step 1: Создать компонент**

```tsx
/**
 * Runtime-управление согласием с Правилами и Политикой (ADMIN).
 * Client-island: тоггл «Требовать согласие» + поле «Текущая версия документов».
 * Без пересборки (PATCH /admin/legal-consent-flag). Дефолт — выключено (fail-safe).
 * Тоггл зеркалит PromotionsAvailabilityToggle; ввод версии — ExchangeRatePanel.
 */
'use client';

import { useState } from 'react';
import {
  useGetLegalConsentFlagQuery,
  useUpdateLegalConsentFlagMutation,
} from '@/store/api/adminLegalConsentFlagApi';

export function LegalConsentRequiredToggle() {
  const { data, isLoading } = useGetLegalConsentFlagQuery();
  const [update, { isLoading: isSaving }] =
    useUpdateLegalConsentFlagMutation();
  const required = data?.legalConsentRequired ?? false;
  const version = data?.legalConsentVersion ?? 1;
  const [draft, setDraft] = useState('');

  const parsed = Number(draft);
  const versionValid =
    draft.trim() !== '' && Number.isInteger(parsed) && parsed >= 1;

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div
        className="row gap-16"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            Требовать согласие с Правилами и Политикой
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            При входе пользователь должен принять Правила и Политику конфиденциальности.
            По умолчанию выключено. Без пересборки.
          </div>
        </div>
        <button
          type="button"
          className={required ? 'abtn abtn-primary' : 'abtn'}
          disabled={isLoading || isSaving}
          onClick={() => void update({ required: !required })}
        >
          {isLoading ? '…' : required ? 'Включено' : 'Выключено'}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>
          Текущая версия документов
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Текущая версия: {isLoading ? '…' : version}. Подняли тексты Правил или
          Политики → поднимите версию: пользователи согласятся заново.
        </div>
        <div className="row gap-16" style={{ marginTop: 12, alignItems: 'center' }}>
          <input
            className="a-field"
            inputMode="numeric"
            placeholder={`Напр. ${version + 1}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="abtn abtn-primary"
            disabled={isSaving || !versionValid}
            onClick={async () => {
              await update({ version: parsed });
              setDraft('');
            }}
          >
            {isSaving ? '…' : 'Сохранить версию'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Типчек**

Run: `pnpm --filter @avino/web exec tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Линт**

Run: `pnpm --filter @avino/web lint`
Expected: без ошибок.

- [ ] **Step 4: (Контроллер) коммит**

```bash
git add apps/web/src/components/admin/LegalConsentRequiredToggle.tsx
git commit -m "feat(web): add LegalConsentRequiredToggle admin component"
```

---

### Task 3: Монтаж на странице настроек

**Files:**
- Modify: `apps/web/src/app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: `LegalConsentRequiredToggle` из `@/components/admin/LegalConsentRequiredToggle` (Task 2).
- Produces: ничего (страница-точка сборки).

- [ ] **Step 1: Добавить импорт**

После строки импорта `MapHoverRecenterToggle` (строка 9) добавить:

```tsx
import { LegalConsentRequiredToggle } from '@/components/admin/LegalConsentRequiredToggle';
```

- [ ] **Step 2: Смонтировать компонент**

В JSX, между `<MapHoverRecenterToggle />` и `<ExchangeRatePanel />` (после строки 58), вставить:

```tsx
      <LegalConsentRequiredToggle />
```

Итоговый блок монтажа должен выглядеть так:

```tsx
      <TelegramNotificationsToggle />
      <SmsSendingToggle />
      <NotificationsSendingToggle />
      <PromotionsAvailabilityToggle />
      <MapHoverRecenterToggle />
      <LegalConsentRequiredToggle />
      <ExchangeRatePanel />
```

- [ ] **Step 3: Типчек + линт**

Run: `pnpm --filter @avino/web exec tsc --noEmit && pnpm --filter @avino/web lint`
Expected: без ошибок.

- [ ] **Step 4: Полная сборка (авторитетная проверка для Next-приложения)**

Run: `pnpm --filter @avino/web exec next build`
Expected: `Compiled successfully`, без TS/ESLint-ошибок. ⚠️ НЕ использовать `rtk next build` для вердикта — он даёт ложное «Errors: 1» при чистой сборке (см. память `avino-rtk-next-build-false-error`); читай вывод raw `next build`.

- [ ] **Step 5: (Контроллер) коммит**

```bash
git add apps/web/src/app/admin/settings/page.tsx
git commit -m "feat(web): mount LegalConsentRequiredToggle on admin settings page"
```

---

### Task 4: ADR-0115 follow-up + DONE.md

**Files:**
- Modify: `docs/adr/ADR-0115-legal-consent-modal.md`
- Modify: `docs/DONE.md`

ADR/DONE готовятся внутри этой же feature-PR, без отдельной follow-up PR (память `avino-finalize-in-feature-pr`).

- [ ] **Step 1: Добавить follow-up секцию в ADR-0115**

В конец файла `docs/adr/ADR-0115-legal-consent-modal.md` (после секции «## Related task») добавить:

```markdown

## Follow-up — PR №2 (apps/web admin-тоггл)

Поставлен админ-контроль в `apps/web` поверх бэкенда этого ADR:

- `apps/web/src/store/api/adminLegalConsentFlagApi.ts` — RTK Query-слайс
  `GET`/`PATCH /admin/legal-consent-flag` (зеркало `adminPromotionsFlagApi`).
- `apps/web/src/components/admin/LegalConsentRequiredToggle.tsx` — тоггл
  «Требовать согласие» + поле «Текущая версия документов» (валидация целое ≥ 1,
  зеркало `@Min(1)` бэка). Дефолт — выключено (PATCH не шлётся без действия админа).
- Смонтирован на `apps/web/src/app/admin/settings/page.tsx` рядом с прочими тогглами.

Остаётся PR №3 (apps/client) — блокирующая модалка + хук-гейт + i18n.
```

- [ ] **Step 2: Добавить запись в DONE.md**

В конец `docs/DONE.md` добавить (формат CLAUDE.md §7; даты — текущий день):

```markdown

## 2026-06-29

### Legal consent — admin-тоггл «Требовать согласие» + версия (apps/web)

Status: DONE
Branch: feat/web-legal-consent-toggle
PR: pending

Files changed:
- apps/web/src/store/api/adminLegalConsentFlagApi.ts
- apps/web/src/components/admin/LegalConsentRequiredToggle.tsx
- apps/web/src/app/admin/settings/page.tsx
- docs/adr/ADR-0115-legal-consent-modal.md

Summary:
- PR №2 фичи «согласие с Правилами+Политикой» (после backend PR #265, ADR-0115).
- RTK Query-слайс `adminLegalConsentFlagApi` поверх `adminApi`:
  `GET`/`PATCH /admin/legal-consent-flag`, тело PATCH `{ required?, version? }`,
  `invalidatesTags: ['Admin']` → состояние перечитывается после изменения.
- Компонент `LegalConsentRequiredToggle`: тоггл «Требовать согласие»
  (зеркало `PromotionsAvailabilityToggle`) + поле «Текущая версия документов»
  (инпут + «Сохранить версию», валидация целое ≥ 1, зеркало `@Min(1)` бэка).
  Дефолт OFF ничего не меняет (PATCH не шлётся без действия админа).
- Смонтирован на `app/admin/settings/page.tsx` рядом с прочими тогглами.
- i18n в admin-панели нет → хардкод RU (как в соседних тогглах).
- `apps/web` без тест-харнесса → верификация tsc + lint + next build (clean).

Commit messages:
- feat(web): add adminLegalConsentFlagApi RTK Query slice
- feat(web): add LegalConsentRequiredToggle admin component
- feat(web): mount LegalConsentRequiredToggle on admin settings page
- docs(legal-consent): ADR-0115 follow-up + DONE entry for web admin toggle

Related ADR:
- docs/adr/ADR-0115-legal-consent-modal.md

Related spec/plan:
- docs/superpowers/specs/2026-06-29-legal-consent-modal-design.md
- docs/superpowers/plans/2026-06-29-web-legal-consent-toggle.md
```

- [ ] **Step 3: (Контроллер) коммит**

```bash
git add docs/adr/ADR-0115-legal-consent-modal.md docs/DONE.md
git commit -m "docs(legal-consent): ADR-0115 follow-up + DONE entry for web admin toggle"
```

---

## Self-Review

**1. Spec coverage** (промпт + дизайн-спека §6):
- RTK слайс `adminLegalConsentFlagApi.ts` GET+PATCH → Task 1 ✓
- Компонент `LegalConsentRequiredToggle.tsx` (тоггл + поле версии, @Min 1, подсказка) → Task 2 ✓
- Монтаж на `settings/page.tsx` рядом с тогглами → Task 3 ✓
- ADR-0115 follow-up + DONE.md → Task 4 ✓
- Только `apps/web` + docs; RTK Query без fetch/axios; RU-хардкод; дефолт OFF не меняет ничего → Global Constraints ✓
- Реальный роут `/admin/legal-consent-flag` (не `/admin/settings/legal-consent` из устаревшей §6) — сверено с мёрженным контроллером ✓

**2. Placeholder scan:** код приведён полностью в каждом шаге, плейсхолдеров нет ✓

**3. Type consistency:** `LegalConsentFlag { legalConsentRequired, legalConsentVersion }` и хуки `useGetLegalConsentFlagQuery`/`useUpdateLegalConsentFlagMutation` определены в Task 1 и используются под теми же именами в Task 2 ✓. Тело PATCH `{ required?, version? }` совпадает с `UpdateLegalConsentFlagDto` бэка ✓.
