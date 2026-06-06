# ADR-0056 — i18n админ-панели (uz/ru/en) на лёгком кастомном контексте

## Status

Accepted

## Date

2026-06-07

## Context

До ADMIN-17 веб-админка была RU-only (осознанно, MVP — см. ADMIN-01). Все
видимые строки были захардкожены в ~30 файлах (страницы, layout, shared-компоненты)
и в доменных словарях меток (`lib/labels.ts`, `lib/users.ts`, `lib/complaints.ts`,
`lib/moderation.ts`, `lib/promotions.ts`, `lib/logs.ts`).

Бизнес-правило проекта (CLAUDE.md §9) требует три языка интерфейса — Uzbek,
Russian, English — и ручное переключение языка пользователем. CLAUDE.md §3 задаёт
паттерн `t("key", lang)`. Нужно было выбрать механизм i18n для админки и вынести
все строки, не сломав существующую RU-подачу.

Рассмотренные варианты:
- **next-intl** — промышленная либа, но в App Router требует переноса всех роутов
  в `app/[locale]/...` + SSR locale negotiation. Большой рефактор структуры ради
  внутреннего инструмента.
- **react-i18next** — без перестройки роутов, но +2 зависимости и свой API вместо
  `t("key", lang)`.
- **Лёгкий кастомный контекст + словари** — React-контекст `LanguageProvider`,
  JSON-словари ru/uz/en, хук `useT()` → `t('key')`; без `[locale]`-роутинга и
  внешних зависимостей.

## Decision

Выбран **лёгкий кастомный i18n** (вариант 3), подтверждено Team Lead.

- `apps/web/src/lib/i18n/`: `config.ts` (локали, метаданные флага/названия,
  `LOCALE_STORAGE_KEY`), `t.ts` (резолвер `translate(locale, key, vars)` по
  точечным ключам с фоллбэком DEFAULT_LOCALE → сам ключ и интерполяцией `{name}`),
  `LanguageProvider.tsx` (контекст + хук `useT()`), `enums.ts` (подписи enum по
  локалям + `useEnumLabels()`/`getEnumLabels()`), `messages/` (словари: `shared` +
  по разделу).
- **Язык интерфейса по умолчанию — RU**, хранится в `localStorage`
  (`avino_admin_lang`). Гидрация выбранного языка — после монтирования, чтобы не
  было hydration mismatch (на сервере и при первом рендере — DEFAULT_LOCALE; в
  `<html lang>` уже `ru`). При смене языка обновляется `document.documentElement.lang`.
- **Переключатель** (`components/common/LanguageSwitcher.tsx`) — дропдаун с
  глобусом, флагом и родным названием текущего языка; пункты — флаг + название,
  активный подсвечен брендовым цветом. Размещён в шапке (рядом с темой) и на
  экранах логина/гарда.
- **Без `[locale]`-роутинга**: язык — клиентское состояние, URL не меняется.
  Подходит для внутреннего admin-tool и совместимо с правилом «пользователь
  переключает язык вручную».
- Доменные словари меток переведены на locale-aware контракт: текст enum ушёл в
  `i18n/enums.ts`; в `lib/*` остались только CSS-классы badge/intent и логика;
  хелперы ошибок/форматирования получили параметр `locale`
  (`formatDateTime(iso, locale)`, `moderationErrorMessage(err, locale)`,
  `periodLabel(days, locale)` и т.д.).

Язык **интерфейса** админки (этот ADR) не путать с языком **объявления**
(`Language` UZ/RU/EN в API-контракте) — это разные сущности.

## Consequences

Positive:
- Три языка интерфейса (uz/ru/en) с мгновенным переключением, без перезагрузки и
  без изменения URL.
- Ноль новых зависимостей и ноль изменений структуры роутов.
- Единый словарь: enum-подписи и сообщения ошибок не дублируются между страницами.
- RU-поведение сохранено (default RU), регрессий подачи нет.

Negative / trade-offs:
- Свой минимальный i18n вместо готовой либы — нет из коробки сложной
  множественной формы/ICU (реализована точечно: RU-плюрализация периода в
  `periodLabel`).
- Язык — клиентское состояние: первый серверный рендер всегда RU, переключение
  применяется после гидрации (для внутреннего инструмента приемлемо).
- `metadata` (тайтл вкладки) дашборда остаётся RU — это серверный document title
  вне клиентского контекста локали; не входит в видимый UI панели.
- Качество узбекских переводов (латиница) — первичное, RU/EN выверены; uz при
  необходимости правится в словарях `messages/`.

## Related files

- `apps/web/src/lib/i18n/config.ts`
- `apps/web/src/lib/i18n/t.ts`
- `apps/web/src/lib/i18n/LanguageProvider.tsx`
- `apps/web/src/lib/i18n/enums.ts`
- `apps/web/src/lib/i18n/index.ts`
- `apps/web/src/lib/i18n/messages/` (shared, listings, complaints, users, logs, promotions)
- `apps/web/src/components/common/LanguageSwitcher.tsx`
- `apps/web/src/app/(admin)/admin/layout.tsx` (LanguageProvider)
- `apps/web/src/lib/{labels,users,complaints,moderation,promotions,logs,format}.ts` (locale-aware контракт)
- Мигрированные страницы/компоненты админки (layout, login, dashboard, listings, complaints, users, logs, promotions, states, DataTable, Pagination, toasts)

## Related task

- ADMIN-17
