# ADR-0149 — Админ-управление юр-документами (Правила / Политика)

## Status

Accepted

## Date

2026-07-21

## Context

Тексты Правил (`/legal/terms`) и Политики (`/legal/privacy`) захардкожены
статическими TS-модулями в `apps/client/src/content/legal/` (per-locale,
ru/uz/en). Любое обновление текста — правка кода + деплой клиента. Юристу/
админу нужен способ создавать и публиковать новые версии документов из
админки без деплоя, при этом:

- механика согласия (`app_settings.legal_consent_version` через
  `LegalConsentFlagService`, append-only `legal_consents`, блок-модалка при
  повышении версии — ADR-0115) должна остаться нетронутой;
- нужен аудит-трейл, доказывающий, какой именно текст действовал в момент
  согласия конкретного пользователя.

## Decision

1. **Версионируемая таблица `legal_documents`** (Prisma `LegalDocument`,
   `LegalDocKind` = `TERMS|PRIVACY`, `LegalDocStatus` =
   `DRAFT|PUBLISHED|ARCHIVED`, миграция
   `20260721130000_legal_documents`). `@@unique([kind, version])`; DRAFT
   всегда держит `version = 0` — уникальный индекс заодно гарантирует
   инвариант «≤1 черновик на kind». PUBLISHED и ARCHIVED неизменяемы (никаких
   PATCH после публикации) — таблица работает как аудит-лог.
2. **Draft → publish в транзакции** (`LegalDocumentsService`):
   - публикация гейтится полнотой всех 6 полей (title+bodyMd × ru/uz/en) —
     иначе `422 LEGAL_TRANSLATIONS_INCOMPLETE` (та же философия, что гейт
     APPROVE у листингов, ADR-0091: не публиковать неполный перевод);
   - `version = max(version по kind) + 1`, прежний PUBLISHED по этому kind
     переводится в ARCHIVED;
   - чекбокс «требует повторного согласия» на публикации →
     `LegalConsentFlagService.setVersion(adminId, current + 1)`, что триггерит
     блок-модалку повторного согласия у всех пользователей; без чекбокса —
     тихое обновление текста без ре-согласия;
   - audit-log запись `LEGAL_DOCUMENT_PUBLISH` (metadata: kind, version,
     requiresConsent);
   - прочие коды ошибок: `LEGAL_DRAFT_EXISTS` (создание второго черновика),
     `LEGAL_NOT_DRAFT` (PATCH/DELETE/publish не-DRAFT документа).
3. **Markdown-подмножество** — `parseLegalMarkdown` +
   `legalAnchorWarnings` в `packages/shared` (одна реализация для клиентского
   рендера и админ-предпросмотра): `## Заголовок {#anchor}` → секция,
   `### Подзаголовок` → subheading, `- пункт` → список, обычные строки →
   абзац. **Инлайн-разметки (bold/links/HTML) нет** — рендерятся только
   текстовые ноды, инъекции исключены by construction; в текущих юр-текстах
   инлайна не было (YAGNI, react-markdown/санитизация не подключались).
4. **Публичный `GET /api/v1/legal/:kind`** — PUBLISHED-документ одной
   локали по `Accept-Language` (без `?lang`, по правилу проекта); `404` до
   первой публикации. **Admin CRUD `/api/v1/admin/legal-documents`**
   (список версий, полный документ, create draft с префиллом из текущего
   PUBLISHED, PATCH, publish, DELETE draft) — см. `docs/API.md` §23.
5. **Клиент (`apps/client`) — серверный фетч, не RTK Query**
   (`lib/api/legal.ts`, паттерн `lib/api/geo.ts`, `revalidate: 300`):
   контент обязан попасть в SSR-HTML. API-документ → `toLegalDoc` → рендер
   прежним `LegalDocument.tsx` без изменений компонента. **При 404/ошибке —
   фолбэк на вшитый TS-контент** (`content/legal/`); вшитый контент остаётся
   в коде навсегда как fail-safe, а не удаляется после появления API-данных.
6. **Админка (`apps/web`) — `/admin/legal`**: вкладки Правила/Политика,
   карточка текущей PUBLISHED-версии, история версий (read-only), редактор
   черновика на 3 таба локалей с markdown-textarea + предпросмотром
   (`parseLegalMarkdown` из `@avino/shared`) и предупреждениями о
   отсутствующих/расходящихся якорях, publish-диалог с чекбоксом
   «требует повторного согласия».

## Consequences

Positive:

- Публикация нового текста Правил/Политики больше не требует деплоя клиента
  — только действие в админке.
- Версии неизменяемы после публикации → `legal_consents.version` ↔
  `legal_documents.version` даёт точный аудит-трейл: для любого согласия
  можно восстановить ровно тот текст, который видел пользователь.
- Повторное согласие управляется явным решением админа (чекбокс), а не
  автоматически при каждой публикации — обновление опечатки не спамит
  пользователей блок-модалкой.
- Единая реализация парсера markdown в `@avino/shared` исключает расхождение
  между тем, что видит админ в предпросмотре, и тем, что рендерится клиенту.

Negative / trade-offs:

- Вшитый TS-контент (`apps/client/src/content/legal/`) со временем
  устареет относительно опубликованных версий и не удаляется — он остаётся
  постоянным фолбэком на случай недоступности API/до первой публикации;
  риск, что кто-то примет его за источник правды, снят комментариями в коде,
  но не устранён технически.
- Инлайн-разметка (bold, ссылки, HTML) в markdown-подмножестве не
  поддерживается — сознательный YAGNI под текущие тексты; если юр-текстам
  понадобится жирный шрифт/ссылки, потребуется расширение парсера и
  повторная ревизия «инъекции исключены by construction».
- PUBLISHED/ARCHIVED неизменяемы — исправление опечатки в опубликованном
  документе требует полного цикла нового draft → publish (новая версия), а
  не точечного PATCH; это осознанный компромисс ради целостности
  аудит-трейла.
- Diff-просмотр между версиями не реализован (см. план, «Вне скоупа») —
  сравнение текстов вручную.

## Related files

- apps/api/prisma/schema.prisma — `LegalDocument`, `LegalDocKind`,
  `LegalDocStatus`
- apps/api/prisma/migrations/20260721130000_legal_documents/
- apps/api/src/legal-documents/legal-documents.service.ts
- apps/api/src/legal-documents/legal-documents.controller.ts
- apps/api/src/legal-documents/admin-legal-documents.controller.ts
- apps/api/src/legal-documents/legal-documents.int-spec.ts
- packages/shared/src/legal-markdown.ts
- apps/client/src/lib/api/legal.ts
- apps/client/src/app/[locale]/legal/{terms,privacy}/page.tsx
- apps/client/src/content/legal/ — вшитый фолбэк-контент
- apps/web/src/app/admin/legal/ — страница редактора
- docs/API.md §23 — Legal documents (версионированные юр-документы + согласие)
- docs/superpowers/specs/2026-07-21-admin-legal-documents-design.md
- docs/superpowers/plans/2026-07-21-admin-legal-documents.md

## Related task

- feat/admin-legal-documents
