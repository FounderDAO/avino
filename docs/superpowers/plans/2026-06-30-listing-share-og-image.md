# Listing Share OG-Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать так, чтобы расшаренная ссылка на объявление давала богатое превью с фото и брендом (как у OLX), а не «протухающую» картинку.

**Architecture:** `og:image` перестаёт указывать на presigned R2-ссылку (TTL 1ч) и указывает на стабильный route-handler `/api/og/listing/[id]`, который на каждый запрос серверно тянет первое фото и стримит его байты с длинным `Cache-Control`. На странице листинга в `openGraph` добавляется `siteName: 'Avino'`.

**Tech Stack:** Next.js 15 App Router (route handler + Metadata API), TypeScript, Vitest (jsdom).

## Global Constraints

- Все изменения — только в `apps/client` (публичный портал). `apps/web`/`apps/api` НЕ трогаем.
- НЕ трогаем git внутри задач реализации (контроллер владеет git; см. правило проекта). Шаги «Commit» в этом плане выполняет тот, кто ведёт реализацию, по одной git-команде за раз.
- Prose/комментарии — на русском; код/имена файлов/маршруты — англ.
- `BASE` импортируется из `@/lib/seo/base` (`process.env.NEXT_PUBLIC_SITE_URL ?? 'https://avino.uz'`).
- `getListingById(id, lang = 'ru')` из `@/lib/api/listings` возвращает `Listing | null`; первое фото — `listing.photos[0].url` (свежая presigned-ссылка sign-on-read).
- Маршрут вне `[locale]`: middleware-matcher `'/((?!api|_next|_vercel|.*\\..*).*)'` исключает `/api`.
- `layout.tsx` НЕ трогаем — `openGraph.siteName: 'Avino'` там уже есть; правится только `openGraph` страницы листинга (Next не deep-merge'ит `openGraph` layout→page).
- Финализация (ADR + DONE.md) — в саму feature-PR до пуша, без отдельной follow-up PR.

---

### Task 1: OG-image route-handler `/api/og/listing/[id]`

**Files:**
- Create: `apps/client/src/app/api/og/listing/[id]/route.ts`
- Test: `apps/client/src/app/api/og/listing/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getListingById(id: string, lang?: string): Promise<Listing | null>` из `@/lib/api/listings`; `BASE: string` из `@/lib/seo/base`.
- Produces: HTTP-маршрут `GET /api/og/listing/:id`. Поведение:
  - есть фото и upstream `ok` → `200` с телом-картинкой, `Content-Type` из upstream (fallback `image/jpeg`), `Cache-Control: public, max-age=86400`;
  - нет листинга / нет фото / upstream не `ok` / исключение → `302` на `${BASE}/apple-icon.png`.

- [ ] **Step 1: Написать падающий тест**

`apps/client/src/app/api/og/listing/[id]/route.test.ts`:

```ts
/**
 * OG-image route-handler: стабильный URL для превью объявления.
 * Стримит первое фото листинга (свежая presigned-ссылка тянется серверно),
 * на любой сбой — 302 на бренд-фолбэк. Закрывает баг «протухающего og:image».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/api/listings', () => ({
  getListingById: vi.fn(),
}));
vi.mock('@/lib/seo/base', () => ({ BASE: 'https://avino.uz' }));

import { getListingById } from '@/lib/api/listings';

const mockedGet = vi.mocked(getListingById);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('стримит байты фото с image content-type и суточным кешем', async () => {
  mockedGet.mockResolvedValue({
    photos: [{ url: 'https://r2.example/signed.jpg?sig=1' }],
  } as never);
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const res = await GET(new Request('https://avino.uz/api/og/listing/abc'), ctx('abc'));

  expect(fetchMock).toHaveBeenCalledWith('https://r2.example/signed.jpg?sig=1');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
  expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
  expect((await res.arrayBuffer()).byteLength).toBe(4);
});

it('редиректит на бренд-фолбэк, когда у листинга нет фото', async () => {
  mockedGet.mockResolvedValue({ photos: [] } as never);
  const res = await GET(new Request('https://avino.uz/api/og/listing/x'), ctx('x'));
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://avino.uz/apple-icon.png');
});

it('редиректит на бренд-фолбэк, когда листинг не найден', async () => {
  mockedGet.mockResolvedValue(null);
  const res = await GET(new Request('https://avino.uz/api/og/listing/none'), ctx('none'));
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://avino.uz/apple-icon.png');
});

it('редиректит на бренд-фолбэк, когда upstream отдаёт не-2xx', async () => {
  mockedGet.mockResolvedValue({
    photos: [{ url: 'https://r2.example/expired.jpg' }],
  } as never);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
  const res = await GET(new Request('https://avino.uz/api/og/listing/y'), ctx('y'));
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://avino.uz/apple-icon.png');
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd apps/client && pnpm exec vitest run src/app/api/og/listing/\[id\]/route.test.ts`
Expected: FAIL — `Failed to resolve import './route'` (модуль ещё не создан).

- [ ] **Step 3: Написать минимальную реализацию**

`apps/client/src/app/api/og/listing/[id]/route.ts`:

```ts
/**
 * Стабильный OG-image для шаринга объявления (route вне [locale]).
 *
 * Зачем: `og:image` нельзя указывать прямо на presigned R2-ссылку — у неё TTL 1ч,
 * и соцсети, кешируя превью, дотягивают картинку позже → 403 → превью без фото
 * (тот же класс бага, что ADR-0086). Здесь URL стабильный (`/api/og/listing/:id`),
 * а живая presigned-ссылка тянется серверно на каждый запрос и стримится наружу.
 *
 * Фолбэк на любой сбой — бренд-иконка, чтобы превью никогда не было без картинки.
 */
import { getListingById } from '@/lib/api/listings';
import { BASE } from '@/lib/seo/base';

export const dynamic = 'force-dynamic';

const fallback = () =>
  Response.redirect(new URL('/apple-icon.png', BASE).toString(), 302);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const listing = await getListingById(id);
    const src = listing?.photos?.[0]?.url;
    if (!src) return fallback();

    const upstream = await fetch(src);
    if (!upstream.ok) return fallback();

    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return fallback();
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd apps/client && pnpm exec vitest run src/app/api/og/listing/\[id\]/route.test.ts`
Expected: PASS — 4 passed.

> Примечание по стримингу: в тесте `new Response(new Uint8Array(...))` и проброс
> `upstream.body` работают на undici (Node 18+), который использует vitest. Если в CI
> окружение не отдаёт `body` как стрим — заменить тело на `await upstream.arrayBuffer()`
> и вернуть `new Response(buf, {...})` (тест на байты не изменится).

- [ ] **Step 5: Commit** (выполняет ведущий реализацию, одной командой)

```bash
git add apps/client/src/app/api/og/listing/
git commit -m "feat(client): стабильный OG-image route для шаринга объявлений"
```

---

### Task 2: Перенаправить `og:image` листинга на стабильный route + `siteName`

**Files:**
- Modify: `apps/client/src/app/[locale]/listing/[id]/page.tsx` (блок `generateMetadata`, ~строки 38-55)

**Interfaces:**
- Consumes: маршрут из Task 1 — `GET /api/og/listing/:id`.
- Produces: страница листинга отдаёт `og:image`/`twitter:image = ${BASE}/api/og/listing/${id}` (абсолютный через `metadataBase`), `og:site_name = Avino`. `og:image` присутствует всегда (даже без фото — фолбэк в маршруте).

- [ ] **Step 1: Заменить формирование og-картинки и добавить siteName**

В `apps/client/src/app/[locale]/listing/[id]/page.tsx` удалить блок:

```ts
  const ogImages = listing.photos[0]
    ? [{ url: listing.photos[0].url, width: 1200, height: 630, alt: listing.title }]
    : [];
```

и заменить его на:

```ts
  // og:image указывает на стабильный route /api/og/listing/:id (а не на presigned
  // R2-ссылку с TTL 1ч), чтобы превью соцсетей не «протухало». Фолбэк-картинку
  // обеспечивает сам маршрут, поэтому og:image отдаём всегда.
  const ogImages = [{ url: `/api/og/listing/${id}`, alt: listing.title }];
```

Затем в объекте `openGraph` добавить `siteName` (Next не deep-merge'ит `openGraph`
из layout, поэтому дублируем здесь явно). Было:

```ts
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${BASE}/${locale}/listing/${id}`,
      images: ogImages,
      locale,
    },
```

Стало:

```ts
    openGraph: {
      type: 'website',
      siteName: 'Avino',
      title,
      description,
      url: `${BASE}/${locale}/listing/${id}`,
      images: ogImages,
      locale,
    },
```

- [ ] **Step 2: Сборка клиента — должна быть чистой**

Run: `pnpm --filter @avino/client exec next build`
Expected: сборка завершается успешно; маршрут `/api/og/listing/[id]` присутствует как `ƒ` (Dynamic) в выводе route-листинга.

> Не доверять `rtk next build` для вердикта (известный ложный «Errors: 1» при чистой
> сборке) — смотреть сырой вывод `next build`.

- [ ] **Step 3: Локальная live-проверка (опционально, если поднят стек)**

Run (при запущенном клиенте на :3001 и наличии листинга `<id>`):
`curl -s http://localhost:3001/en/listing/<id> | grep -Eio '<meta[^>]+og:(image|site_name)[^>]*>'`
Expected: `og:image` = `…/api/og/listing/<id>` (без `X-Amz-…`), присутствует `og:site_name` = `Avino`.

- [ ] **Step 4: Commit**

```bash
git add "apps/client/src/app/[locale]/listing/[id]/page.tsx"
git commit -m "feat(client): og:image листинга → стабильный route + og:site_name"
```

---

### Task 3: Финализация — ADR + DONE.md (в этой же feature-PR)

**Files:**
- Create: `docs/adr/ADR-0118-listing-share-stable-og-image.md`
- Modify: `docs/DONE.md`

**Interfaces:**
- Consumes: результаты Task 1-2.
- Produces: запись ADR и строка в DONE.md. (Сверить актуальный номер ADR перед созданием — взять следующий свободный после максимального существующего.)

- [ ] **Step 1: Определить следующий номер ADR**

Run: `ls docs/adr | sort | tail -3`
Expected: видно максимальный `ADR-0117-…`; новый файл — `ADR-0118-…` (или следующий свободный, если 0118 занят).

- [ ] **Step 2: Создать ADR**

`docs/adr/ADR-0118-listing-share-stable-og-image.md`:

```markdown
# ADR-0118: Стабильный OG-image для шаринга объявлений

**Дата:** 2026-06-30
**Статус:** Accepted

## Контекст

`og:image` страницы объявления указывал на presigned R2-ссылку (`X-Amz-Expires=3600`,
TTL 1ч). При шаринге в Telegram превью оставалось без картинки: соцсети кешируют HTML
и дотягивают/перепроверяют картинку позже, к этому моменту ссылка истекает (403). Тот же
класс бага, что ADR-0086 для самих карточек. Дополнительно отсутствовал `og:site_name`.

## Решение

Добавлен route-handler `GET /api/og/listing/:id` (`apps/client`, вне `[locale]`),
который на каждый запрос серверно тянет первое фото листинга и стримит байты с
`Cache-Control: public, max-age=86400`. `og:image`/`twitter:image` страницы листинга
указывают на этот стабильный URL; presigned-ссылка наружу не утекает. На любой сбой
(нет фото / листинг не найден / upstream не 2xx) — 302 на бренд-иконку `/apple-icon.png`.
В `openGraph` страницы листинга добавлен `siteName: 'Avino'` (Next не deep-merge'ит
`openGraph` layout→page, поэтому дублируется явно).

## Последствия

- Превью соцсетей больше не «протухает»: стабильный URL всегда резолвится в живое фото.
- Каждый фетч og:image краулером = один lookup листинга + проксирование фото (≈20-30КБ);
  ответ кешируется на сутки.
- Операционно: уже расшаренные ссылки показывают старое кеш-превью, пока Telegram не
  обновит кеш (`@WebpageBot` или со временем) — проверять на свежей ссылке.
```

- [ ] **Step 3: Добавить запись в DONE.md**

Дописать в конец соответствующего раздела `docs/DONE.md` строку:

```markdown
- **Стабильный OG-image для шаринга объявлений** (ADR-0118): `og:image` листинга → route `/api/og/listing/:id` (проксирует фото, кеш 1д) вместо presigned-ссылки с TTL 1ч; + `og:site_name: Avino`. Чинит «скучное» превью при шаринге в Telegram. apps/client.
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/ADR-0118-listing-share-stable-og-image.md docs/DONE.md docs/superpowers/specs/2026-06-30-listing-share-og-image-design.md docs/superpowers/plans/2026-06-30-listing-share-og-image.md
git commit -m "docs: ADR-0118 + DONE — стабильный OG-image для шаринга объявлений"
```

---

## Post-implementation verification (staging)

После мёржа и деплоя на staging:

1. `curl -sS -A "TelegramBot (like TwitterBot)" "https://test.avino.uz/en/listing/<id>" | grep -Eio 'og:(image|site_name)[^>]*'`
   → `og:image` = `…/api/og/listing/<id>`, есть `og:site_name`.
2. Фетч og:image как бот: `curl -A "TelegramBot" -o /dev/null -w "%{http_code} %{content_type}\n" "https://test.avino.uz/api/og/listing/<id>"` → `200 image/jpeg`.
3. На **свежей** ссылке проверить превью в Telegram; для уже расшаренных — сбросить кеш через `@WebpageBot`.

---

## Self-Review

**Spec coverage:**
- Компонент 1 (route-handler) → Task 1. ✅
- Компонент 2 (og:image листинга → стабильный URL + siteName) → Task 2. ✅
- Обработка ошибок (фолбэк 302) → Task 1, тесты (б)(в)(г). ✅
- Тестирование (unit (а)(б)(в), сборка) → Task 1 Step 1, Task 2 Step 2. ✅
- layout.tsx — намеренно НЕ в плане (siteName уже есть). ✅
- Финализация ADR+DONE → Task 3. ✅
- Операционная заметка (кеш Telegram) → ADR + Post-impl verification. ✅

**Placeholder scan:** плейсхолдеров нет — весь код приведён целиком; единственный «<id>» в curl-проверках — это реальный параметр для подстановки на staging, не TODO.

**Type consistency:** `getListingById(id)`, `listing.photos[0].url`, `BASE`, `GET(_req, { params: Promise<{id}> })` согласованы между Task 1 (реализация + тест) и Task 2 (потребитель маршрута). `Cache-Control: public, max-age=86400` и фолбэк-URL `${BASE}/apple-icon.png` совпадают в реализации, тестах и ADR.
