# ADR-0114 — Публичные страницы «Правила сервиса» и «Политика конфиденциальности»

## Status

Accepted

## Date

2026-06-29

## Context

Порталу Avino (apps/client) нужны публичные юридические страницы по образцу OLX.uz —
«Правила сервиса» и «Политика конфиденциальности». Ссылки в футере были заглушками на
`/help`. Контент нужен на трёх языках (uz/ru/en). Реквизиты юрлица на момент реализации
неизвестны. Длинный юридический текст нельзя класть в `messages/*.json`, так как next-intl
грузит весь файл сообщений на каждой странице портала.

## Decision

Гибридное хранение контента:
- короткий UI-каркас (заголовки вкладок, «обновлено», «содержание», крошки) — в next-intl
  namespace `legal` в `messages/{ru,uz,en}.json`;
- длинное тело документов — в типизированных per-locale TS data-модулях
  `apps/client/src/content/legal/{terms,privacy}.{ru,uz,en}.ts` (модель `LegalDoc` из
  `content/legal/types.ts`), которые подгружаются только на роутах `/legal/*` через статичный
  загрузчик `getLegalDoc(kind, locale)` с фолбэком на ru.

Один общий серверный компонент `LegalDocument` рендерит любой `LegalDoc` (H1, дата
обновления, липкое оглавление с якорными ссылками без JS, секции p/list/subheading).
Роуты: `/legal/terms` и `/legal/privacy`. Юридические реквизиты — плейсхолдер-токены
(`[НАЗВАНИЕ ЮРЛИЦА]`, `[ОРГ-ПРАВОВАЯ ФОРМА]`, `[ЮР. АДРЕС]`, `[ИНН/ОГРН]`,
`[ДАТА РЕГИСТРАЦИИ]`, `[EMAIL ОПЕРАТОРА ДАННЫХ]`), единые (кириллицей) во всех языках,
под последующую замену. Идентификаторы секций стабильны между языками; инвариант
обеспечивается тестами `terms.test.ts` / `privacy.test.ts`.

## Consequences

Positive:
- Длинная юридическая проза не попадает в глобальный i18n-бандл всех страниц.
- Единый рендер и оглавление для обоих документов и всех трёх языков.
- Структурные инварианты (одинаковые id секций и updatedAt во всех локалях) проверяются тестами.
- Переключение языка сохраняет якорь `#section-id`.

Negative / trade-offs:
- Плейсхолдер-токены нужно заменить реальными реквизитами, и весь текст должен пройти
  ревью юриста перед публикацией в продакшене (тексты — черновик, не юридическая консультация).
- Узбекская латиница требует чистоты (без кириллических двойников, `ċ`, мягких переносов);
  токены остаются кириллицей как единственное исключение.
- Новый (простой, типобезопасный) контент-паттерн `content/legal/` в репозитории.

## Related files

- apps/client/src/content/legal/types.ts
- apps/client/src/content/legal/{terms,privacy}.{ru,uz,en}.ts
- apps/client/src/content/legal/index.ts
- apps/client/src/features/legal/LegalDocument.tsx
- apps/client/src/app/[locale]/legal/{terms,privacy}/page.tsx
- apps/client/src/components/layout/Footer.tsx
- apps/client/messages/{ru,uz,en}.json

## Related task

- Legal pages (Terms of Service & Privacy Policy) — branch feat/legal-pages
