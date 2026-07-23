# Дизайн: богатое превью ссылок на объявления (стабильный OG-image)

**Дата:** 2026-06-30
**Приложение:** `apps/client` (публичный портал)
**Тип:** bugfix + small feature
**Связано:** ADR-0086 (sign-on-read presigned TTL), ADR-0104 (JSON-LD на detail)

## Проблема

При шаринге ссылки на объявление (`https://test.avino.uz/en/listing/<id>`) в Telegram
превью «скучное»: видна цена/заголовок, но **нет картинки** и нет строки-бренда.
У OLX превью богатое — с фото и «www.olx.uz».

### Root cause

Страница `apps/client/src/app/[locale]/listing/[id]/page.tsx` **уже** генерирует
`og:title`, `og:description`, `og:image` через `generateMetadata`. Проблема в значении
`og:image`:

```
og:image = https://…r2.cloudflarestorage.com/avinodev/seed/catalog/building-3.jpg
           ?X-Amz-Expires=3600&X-Amz-Date=…&X-Amz-Signature=…
```

Это **presigned R2-ссылка с TTL = 1 час** (тот же класс бага, что ADR-0086 для самих
карточек). В момент рендера картинка валидна (проверено: `HTTP 200, image/jpeg, 23КБ`),
но соцсети кешируют HTML и дотягивают/перепроверяют картинку позже — через час
подписанная ссылка отдаёт `403`, и превью остаётся без картинки (а Telegram кеширует
«картинки нет»).

Дополнительно: отсутствует `og:site_name` → нет жирной строки-бренда, как «www.olx.uz».

## Решение (вариант A — надёжный фикс)

Дать `og:image` **стабильный, не истекающий** URL в домене приложения, который на каждый
запрос резолвится в живую картинку. Presigned-ссылка наружу не утекает.

### Компоненты

#### 1. OG-image route-handler — `apps/client/src/app/api/og/listing/[id]/route.ts` (новый)

- Вне сегмента `[locale]`. Middleware-matcher `'/((?!api|_next|_vercel|.*\\..*).*)'`
  исключает `/api` — маршрут доступен без locale-префикса (как `robots.ts`/`sitemap.ts`).
- `export const dynamic = 'force-dynamic'`.
- `GET(req, { params })`:
  1. `const { id } = await params` (Next 15 — params асинхронные).
  2. `const listing = await getListingById(id)` — язык по умолчанию (нужно только фото).
  3. `const src = listing?.photos?.[0]?.url` (свежая presigned-ссылка от sign-on-read).
  4. Если `src` есть: `const upstream = await fetch(src)`; при `upstream.ok` —
     стримим тело назад:
     ```ts
     return new Response(upstream.body, {
       headers: {
         'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
         'Cache-Control': 'public, max-age=86400',
       },
     });
     ```
  5. Иначе (нет листинга / нет фото / `!upstream.ok`) — фолбэк:
     `Response.redirect(new URL('/apple-icon.png', BASE), 302)`.

Стабильный URL `${BASE}/api/og/listing/{id}` всегда отдаёт живые байты → истечения нет.

#### 2. Метаданные листинга — `apps/client/src/app/[locale]/listing/[id]/page.tsx` (правка)

В `generateMetadata`:
- `openGraph.images` и `twitter.image` → **всегда** `{ url: \`/api/og/listing/${id}\`, alt: listing.title }`
  (metadataBase делает URL абсолютным; фолбэк-картинка обеспечивается маршрутом, поэтому
  og:image эмитится даже для листингов без фото).
- Убрать захардкоженные `width: 1200, height: 630` (реальные размеры фото не гарантируем;
  Telegram масштабирует сам).
- Добавить `openGraph.siteName: 'Avino'`.

> **Почему дубль `siteName`:** `layout.tsx` уже задаёт `openGraph.siteName: 'Avino'`,
> но на странице листинга `og:site_name` отсутствовал (проверено curl'ом). Это
> эмпирически подтверждает: Next **не** deep-merge'ит объект `openGraph` между layout
> и page — собственный `openGraph` страницы целиком замещает layout-овский. Поэтому
> `siteName` нужно добавить именно в `openGraph` листинга. Правка `layout.tsx` не требуется.

### Поток данных

```
краулер ─GET→ /{locale}/listing/{id}
        ←──── og:image = ${BASE}/api/og/listing/{id}, og:site_name = Avino
краулер ─GET→ ${BASE}/api/og/listing/{id}
              route → getListingById → fetch(photos[0].url) → stream bytes (cache 1d)
        ←──── image/jpeg байты
краулер кеширует БАЙТЫ под стабильным URL. Presigned-ссылка наружу не утекает.
```

### Обработка ошибок

- Листинг не найден / нет фото / upstream не `200` → `302` на `${BASE}/apple-icon.png`.
  Превью никогда не остаётся без картинки.

### Тестирование

- **Unit** (`route.test.ts`, Vitest): мок `getListingById` + глобальный `fetch`.
  - (а) есть фото и `upstream.ok` → ответ стримит тело, `Content-Type` из upstream,
    `Cache-Control: public, max-age=86400`.
  - (б) нет фото → `302` на `/apple-icon.png`.
  - (в) `getListingById` → `null` → `302` на фолбэк.
- **Сборка:** `pnpm --filter @avino/client build` — чисто.
- **Локально:** `GET /api/og/listing/<id>` отдаёт байты картинки.
- **После деплоя (staging):** curl og-тегов; фетч `og:image` как `TelegramBot`;
  на свежей ссылке — сбросить кеш Telegram через `@WebpageBot`.

## Затрагиваемые файлы (всё `apps/client`)

| Файл | Действие |
|------|----------|
| `src/app/api/og/listing/[id]/route.ts` | new — route-handler |
| `src/app/[locale]/listing/[id]/page.tsx` | edit — og:image → стабильный URL, siteName |
| `src/app/api/og/listing/[id]/route.test.ts` | new — unit-тест маршрута |

> `layout.tsx` **не** трогаем — `openGraph.siteName: 'Avino'` там уже есть.

## Вне объёма (возможные будущие улучшения)

- Брендированная композитная share-карточка (`@vercel/og`: фото + цена + заголовок + лого).
- OG-image для других страниц (поиск, главная) сверх дефолтного `siteName`.
- Ресайз/нормализация фото к 1200×630.

## Операционная заметка

Даже после фикса **уже расшаренная** ссылка показывает старое кешированное превью, пока
Telegram не обновит кеш (`@WebpageBot` или со временем). Верифицировать — на свежей ссылке.
