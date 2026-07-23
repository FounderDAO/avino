# Chat Thread Listing Context (Client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В списке диалогов чата (и в шапке открытого диалога) видно, о каком объявлении идёт речь: фото объекта как аватар + строка «название · цена».

**Architecture:** Только UI-правки в `Inbox.tsx`: новый внутренний компонент `ThreadAvatar` (фото из `listing_preview.thumbnail_url` через существующий `PhotoImg`, фолбэк — текущий круг с инициалом) + строка объявления в карточке диалога. API уже отдаёт всё нужное — бэкенд не трогаем.

**Tech Stack:** Next.js, TypeScript, next-intl, RTK Query (существующий `chatApi`).

**Spec:** `docs/superpowers/specs/2026-07-02-chat-thread-listing-context-design.md`

## Global Constraints

- Правки ТОЛЬКО внутри `apps/client/` (одна app-папка = один PR, CLAUDE.md); фактически — один файл `Inbox.tsx`.
- Комментарии — по-русски, в стиле файла.
- В `main` не коммитить: ветка `feat/chat-thread-listing-context`, потом PR.
- Команды выполняются из `apps/client/`.
- Unit-тестов на `Inbox` нет (и не заводим ради JSX-правки) — проверка: tsc/lint/build + ручная (seed-chat).

**Первый шаг перед Task 1:**

```bash
git checkout -b feat/chat-thread-listing-context
```

---

### Task 1: `ThreadAvatar` + строка объявления в списке диалогов

**Files:**
- Modify: `apps/client/src/features/account/Inbox.tsx`

**Interfaces:**
- Consumes: `ApiThread.listing_preview` (`title`, `thumbnail_url`, `price`, `currency`, `status`) — уже в `@/store/api/chatApi`; `PhotoImg` из `@/components/ui/photo-img` (fill-режим: контейнер должен быть `relative` с явными размерами); существующие хелперы `avatarInitial`, `threadTitle`, `listingSubtitle`.
- Produces: `function ThreadAvatar({ thread, className }: { thread: ApiThread; className: string })` — используется в Task 2 для шапки.

- [ ] **Step 1: Добавить импорт и компонент ThreadAvatar**

1. К импортам добавить:

```ts
import { PhotoImg } from '@/components/ui/photo-img';
```

2. После хелпера `avatarInitial` (строка ~60) добавить:

```tsx
/**
 * Аватар диалога — фото объекта (`listing_preview.thumbnail_url`), чтобы при
 * нескольких объявлениях у одного собеседника диалоги различались визуально
 * (spec 2026-07-02-chat-thread-listing-context). Фолбэк (нет превью или фото) —
 * прежний круг с инициалом собеседника. `className` задаёт размеры (h-* w-*).
 */
function ThreadAvatar({
  thread,
  className,
}: {
  thread: ApiThread;
  className: string;
}) {
  const src = thread.listing_preview?.thumbnail_url;
  if (src) {
    return (
      <span
        className={cn(
          'relative shrink-0 overflow-hidden rounded-[10px]',
          className,
        )}
      >
        <PhotoImg src={src} sizes="48px" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-mint text-[16px] font-extrabold text-teal-deep',
        className,
      )}
    >
      {avatarInitial(thread)}
    </span>
  );
}
```

(`cn` уже импортирован в файле.)

- [ ] **Step 2: Карточка диалога — фото + строка объявления**

В рендере списка (внутри `list.map((t) => { ... })`):

1. Фолбэк превью последней реплики: строка объявления теперь отдельная, поэтому заменить

```ts
              const preview =
                lastMessagePreview(
                  t.last_message,
                  currentUserId,
                  tAccount('inbox.you'),
                ) ?? listingSubtitle(t, tUnits);
```

на

```ts
              const preview =
                lastMessagePreview(
                  t.last_message,
                  currentUserId,
                  tAccount('inbox.you'),
                ) ?? '';
```

2. Заменить аватар-спан

```tsx
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint text-[16px] font-extrabold text-teal-deep">
                    {avatarInitial(t)}
                  </span>
```

на

```tsx
                  <ThreadAvatar thread={t} className="h-11 w-11" />
```

3. Между строкой «имя + время» и строкой превью вставить строку объявления. После закрывающего `</span>` блока

```tsx
                    <span className="flex items-center justify-between gap-2">
                      ...
                    </span>
```

добавить:

```tsx
                    {t.listing_preview && (
                      <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                        {t.listing_preview.title} · {listingSubtitle(t, tUnits)}
                      </span>
                    )}
```

(`listing_preview == null` — например, история по DELETED-листингу без превью — строка просто скрыта, карточка деградирует до текущего вида.)

- [ ] **Step 3: Проверка типов**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/features/account/Inbox.tsx
git commit -m "feat(chat): listing photo and title in thread list items"
```

---

### Task 2: Миниатюра в шапке открытого диалога

**Files:**
- Modify: `apps/client/src/features/account/Inbox.tsx` (блок «Шапка диалога», ~строка 387)

**Interfaces:**
- Consumes: `ThreadAvatar` из Task 1.
- Produces: —.

- [ ] **Step 1: Заменить аватар шапки на фото объекта**

В блоке «Шапка диалога» заменить

```tsx
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint font-extrabold text-teal-deep">
                  {avatarInitial(selectedThread)}
                </span>
```

на

```tsx
                <ThreadAvatar thread={selectedThread} className="h-10 w-10" />
```

(Существующая ссылка «название · цена» на `/listing/:id` под именем остаётся без изменений.)

- [ ] **Step 2: Проверка типов**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/features/account/Inbox.tsx
git commit -m "feat(chat): listing thumbnail in conversation header"
```

---

### Task 3: Полная проверка + PR

- [ ] **Step 1: Линт, типы, тесты, сборка**

Run: `pnpm lint && npx tsc --noEmit && pnpm test && pnpm build`
Expected: всё зелёное (тесты — существующие, `--passWithNoTests`).

- [ ] **Step 2: Ручная проверка (dev + seed)**

Данные: `apps/api/prisma/seed-chat.cjs` (треды с сообщениями). Проверить кейсы из спеки:

- тред с фото → фото-аватар + строка «название · цена»;
- тред без фото у листинга → фолбэк-инициал, строка объявления есть;
- `listing_preview == null` → аватар-инициал, строки объявления нет;
- длинное название → truncate, ряд не ломается;
- мобильная ширина (<640px) → один пейн, карточка не переполняется;
- шапка открытого диалога → миниатюра + существующая ссылка на листинг.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/chat-thread-listing-context
```

PR title: `feat(chat): show listing photo and title in thread list`

PR description:
- В списке диалогов аватар — фото объекта, плюс строка «название · цена»: продавец с несколькими объявлениями (и клиент с несколькими продавцами) сразу видит, о каком объекте диалог.
- Шапка открытого диалога — та же миниатюра (ссылка на листинг уже была).
- Бэкенд не менялся: `listing_preview` уже приходит из `GET /chat/threads`.
- Как проверить: dev-сборка + seed-chat, кейсы в плане (фото/без фото/null-превью/мобильный).

---

## Self-Review (выполнено при написании плана)

- Spec coverage: п.1 аватар-фото с фолбэком → Task 1; п.2 три строки карточки → Task 1; п.3 миниатюра в шапке → Task 2; кейсы проверки → Task 3. Пробелов нет.
- Placeholders: нет.
- Типы: `ThreadAvatar({ thread, className })` согласован между Task 1 (объявление) и Task 2 (использование); `PhotoImg` используется в fill-режиме внутри `relative`-контейнера с размерами — как требует его контракт.
