# ADR-0059 — Публичный портал: библиотека UI-компонентов shadcn/ui

## Status

Accepted

## Date

2026-06-08

## Context

Публичный портал `apps/client` (Zillow-подобный пользовательский фронтенд,
ADR-0057) заскаффолжен в TASK-140 на Next 15 + React 19 + Tailwind v4 с дизайн-
токенами в `@theme` (по образцу ADR-0043) и RTK Query (CLAUDE.md §4). Для
пользовательских страниц (поиск, карточка, формы, чат, модалки, дропдауны
фильтров, галерея) нужна библиотека UI-компонентов.

Рассматривались: shadcn/ui (Radix + Tailwind), Mantine, MUI, голый Radix.
Ключевые требования: кастомный Zillow-подобный вид под бренд Avino (юридически
нельзя копировать Zillow 1:1), совместимость с Tailwind v4 / React 19 / App
Router, доступность (a11y), отсутствие второй конкурирующей системы стилей.

Админка `apps/web` использует TailAdmin (ADR-0044) — это её решение и оно не
меняется; данный ADR касается только `apps/client`.

## Decision

Для `apps/client` принимается **shadcn/ui** (примитивы Radix UI + Tailwind).

- shadcn/ui — это не runtime-зависимость, а **генерация компонентов в кодовую
  базу** (`apps/client/src/components/ui/*`); командой владеем мы, что позволяет
  отстроить дизайн от Zillow под бренд Avino без правок чужого пакета.
- Темизация shadcn через CSS-переменные ложится на уже заведённые дизайн-токены
  Tailwind v4 `@theme` — единый источник истины для цветов/радиусов/типографики
  остаётся прежним (ADR-0043), второй системы стилей не вводится.
- Конфигурация: `components.json` с `"cssVariables": true`, alias `@/components`,
  `@/lib/utils` (`cn()` на `clsx` + `tailwind-merge`).
- Зависимости добавляются по мере нужных компонентов:
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
  `tw-animate-css` (анимации под Tailwind v4) и точечные `@radix-ui/react-*`.
- Radix внутри даёт доступность и поведение (Dialog, DropdownMenu, Tabs,
  Popover, Tooltip) — закрывает фильтры, галерею, чат, модалки.

Не входит в решение и не меняется: данные — только RTK Query; карты — Yandex
Maps; auth — backend OTP; стиль сборки — Next 15 + React 19 + Tailwind v4.

## Consequences

Positive:

- Уникальный брендовый UI без вида «шаблона»; код компонентов под нашим контролем.
- Нативная совместимость с Tailwind v4 + React 19 + Next App Router.
- Один источник дизайн-токенов (общий с уже выбранным `@theme`).
- a11y и поведение сложных компонентов из коробки (Radix).

Negative / trade-offs:

- Сложные составные компоненты собираются самостоятельно (нет готовых таблиц/
  дашбордов «как в Mantine»).
- Две разные UI-базы в монорепо: TailAdmin (admin) и shadcn/ui (client) —
  осознанный компромисс ради разных аудиторий и дизайн-систем (ADR-0057).

## Related files

- apps/client/package.json
- apps/client/components.json (добавляется при инициализации shadcn)
- apps/client/src/components/ui/
- apps/client/src/lib/utils.ts
- apps/client/src/app/globals.css (дизайн-токены `@theme`)
- docs/AvinoWebPlan.md (§1, §3)

## Related task

- TASK-151 (первая UI-насыщенная страница публичного портала)
