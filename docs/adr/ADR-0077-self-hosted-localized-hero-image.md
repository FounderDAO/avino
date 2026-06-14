# ADR-0077 — Self-hosted локализованный hero-ассет (apps/client)

## Status

Accepted

## Date

2026-06-15

## Context

Hero главной (`apps/client/src/features/home/Hero.tsx`) хотлинкал внешний
Unsplash напрямую:

```ts
const HERO_PHOTO = 'https://images.unsplash.com/photo-1486406146926-...';
```

Проблемы: (1) внешняя сетевая зависимость для первого экрана (LCP зависит от
стороннего CDN, нет `priority`/оптимизации Next), (2) generic-сток стеклянных
высоток, не релевантный Узбекистану. Аналогичный хотлинк есть и в других местах
(`Districts.tsx`, `Sell.tsx`, `PhotoUploader.tsx`) — но эта задача (TASK-204)
ограничена Hero.

## Decision

Hero рендерит **локальный self-hosted ассет** через `next/image` с `priority`:

```tsx
<Image src="/hero/tashkent.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
```

- Ассет лежит в `apps/client/public/hero/tashkent.jpg` — отдаётся самим
  приложением, оптимизируется Next Image (webp/avif на выдаче), без внешнего
  хотлинка на первом экране. `priority` — это LCP-картинка.
- Картинка релевантна Узбекистану: **Tashkent City towers**. Источник —
  Wikimedia Commons (`File:TashkentCity.jpg`, автор Solijonovm1996), лицензия
  **CC BY-SA 4.0**. Атрибуция зафиксирована в `apps/client/public/hero/CREDITS.txt`.
- Ассет — авто-подобранный плейсхолдер: заменяется на брендовое фото одним
  файлом по тому же пути `public/hero/tashkent.jpg`, **без правок кода**.

`PhotoImg` (обёртка над `next/image`) в Hero больше не используется — фон
переведён на прямой `next/image` с `fill` для контроля `priority`/`object-cover`.

## Consequences

Positive:
- Нет внешней сетевой зависимости и хотлинка для первого экрана; LCP под
  контролем (`priority`, оптимизация Next Image).
- Картинка локализована (Ташкент), self-hosted, кэшируется приложением.
- Замена брендового фото — drop-in (один файл, тот же путь).

Negative / trade-offs:
- CC BY-SA 4.0 требует атрибуции и share-alike — зафиксировано в `CREDITS.txt`;
  для продакшна рекомендуется заменить на собственное/лицензионно-чистое фото.
- Остальные внешние Unsplash-хотлинки (`Districts`, `Sell`, `PhotoUploader`)
  не тронуты — отдельные задачи при необходимости.

## Related files

- apps/client/src/features/home/Hero.tsx
- apps/client/public/hero/tashkent.jpg
- apps/client/public/hero/CREDITS.txt

## Related task

- TASK-204
