# ADR-0141 — CSP и security-заголовки на фронтах + экранирование JSON-LD

## Status

Accepted

## Date

2026-07-13

## Context

Security-аудит схемы аутентификации (2026-07-13) показал: access/refresh-токены
хранятся в localStorage (client — оба, web — только refresh), при этом фронты
отдаются **вообще без security-заголовков** — ни CSP, ни `frame-ancestors`, ни
`Referrer-Policy`. Helmet стоит только на API (apps/api/src/main.ts) и защищает
JSON-ответы, а не рендер страниц. Caddy (deploy/Caddyfile) заголовков тоже не
добавляет.

В DOM портала при этом исполняются 4 сторонних скрипта с полным доступом к
`localStorage`: Yandex Maps SDK, Google GSI, Apple JS, Sentry. Любой XSS или
компрометация одного из этих CDN (supply chain) уносит 30-дневный refresh-токен.

Отдельно: `JsonLd.tsx` вставлял `JSON.stringify(data)` в `<script>` без
экранирования `<`. В JSON-LD страницы объявления попадают пользовательские
`title`/`desc`/`address` — строка `</script><script>…` в описании объявления
вырывалась бы из тега → **stored XSS** (модерация текст видит, но payload легко
маскируется).

Полный отчёт аудита (threat model, целевой BFF-дизайн, план из 7 PR) — в
docs/TASKS.md / истории сессии; это PR-1 плана (quick wins).

## Decision

1. **CSP + security-заголовки через `headers()` в `next.config.mjs` обоих
   фронтов** (не в Caddy): работает одинаково в dev/staging/prod и живёт рядом
   с кодом, который от него зависит. Заголовки запекаются в build
   (routes-manifest) — env-переменные (`NEXT_PUBLIC_API_BASE_URL`,
   `CSP_REPORT_ONLY`) действуют на момент сборки образа.

2. **Allowlist по фактическим рантайм-зависимостям**:
   - client: скрипты `*.yandex.ru`, `yastatic.net`, `accounts.google.com`,
     `appleid.cdn-apple.com`; connect — API-origin (+ ws для socket.io /rt),
     `*.yandex.{ru,net}`, `*.sentry.io`; img — R2-хосты (cdn.avino.uz,
     `*.r2.cloudflarestorage.com`, `*.r2.dev`), unsplash, яндекс-тайлы,
     gstatic; frame — Google/Apple auth.
   - web (админка): без сторонних SDK — только API, Sentry, R2-хосты фото.
   - оба: `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
     `X-Content-Type-Options: nosniff`,
     `Referrer-Policy: strict-origin-when-cross-origin`,
     `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

3. **`'unsafe-inline'` в script-src оставлен**: Next.js гидрация использует
   inline-скрипты, nonce-инфраструктуры (middleware) нет. Главная ценность CSP
   здесь — `connect-src`/`img-src`/`frame-src` allowlist, режущий каналы
   эксфильтрации токенов, и запрет внешних скриптов вне 4 доверенных CDN.

4. **`'wasm-unsafe-eval'` обязателен для client**: вектор-рендерер Yandex Maps
   работает на WebAssembly; без него карта — пустой canvas (проверено live,
   ошибка «CompileError… violates CSP» видна только в консоли).

5. **`CSP_REPORT_ONLY=true` на build** переключает заголовок на
   `Content-Security-Policy-Report-Only` — механизм обкатки на staging без
   риска поломки. По умолчанию enforce.

6. **JsonLd**: `JSON.stringify(data).replace(/</g, '\\u003c')` — стандартное
   экранирование, эквивалентное для JSON-парсеров и безопасное внутри
   `<script>`.

## Consequences

- XSS/supply-chain эксфильтрация токенов резко затруднена: fetch/XHR/WS только
  на allowlisted-хосты, сторонние скрипты — только 4 доверенных CDN.
- Кликджекинг исключён (`frame-ancestors 'none'`).
- Stored XSS через JSON-LD закрыт.
- Новая внешняя интеграция на фронте теперь требует правки CSP в
  `next.config.mjs` — это осознанная цена (заодно форсит ревью новых
  зависимостей).
- Заголовки фиксируются на build: смена API-домена требует пересборки образа
  (это и так верно для `NEXT_PUBLIC_*`).
- Дальнейшие шаги плана (access-в-памяти, список сессий, BFF с httpOnly
  cookie) — отдельные PR.

## Verification

- `next build` обоих фронтов зелёный; 529 тестов client зелёные.
- `curl -I` на прод-сборке: все 5 заголовков отдаются (client :3210, web :3211).
- Live-смоук /ru/map под enforce-CSP: тайлы, кластеры, ценники, фото карточек
  рендерятся; `securitypolicyviolation` не фиксирует нарушений.
- Гоча для будущих проверок: Dark Reader в браузере MCP делает канвас карты
  визуально пустым — верифицировать headless-Chrome без расширений.
