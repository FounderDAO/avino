# ADR-0153 — refresh-токен в httpOnly cookie

## Status

Proposed

## Date

2026-07-22

## Context

Схема хранения токенов сейчас (ADR-0142, паритет `apps/client` и `apps/web`):

- `access` — только в памяти Redux (не персистится → XSS после reload не
  достанет);
- `refresh` — зеркалится в `localStorage`, общий для вкладок одного origin.

Два дефекта этой схемы:

1. **XSS-кража refresh.** Любой инъектнутый/сторонний скрипт читает
   `localStorage` и уносит refresh-токен — а это долгая сессия, что опаснее
   кражи короткоживущего access. Для access мы сознательно ушли в память
   именно из-за XSS; refresh при этом остался в JS-доступном хранилище.

2. **Гонка ротации между вкладками.** Single-flight у refresh был только внутри
   одной вкладки. Две вкладки, одновременно поймавшие 401, ротировали один и тот
   же токен из общего `localStorage`; вторая предъявляла уже отработанный →
   `TOKEN_REUSED` → сервер отзывал всю session-family (`token.service.ts`).
   Устройство ловило каскад 401, а поток `POST /auth/refresh` упирался в throttle
   20/60s **на IP** (`auth.controller.ts`) → 429 («устройство залипает по IP»).
   PR #447 закрыл это костылём Web Locks API, но корень — refresh в JS-хранилище.

Next.js даёт первоклассный сервер (Route Handlers, middleware, RSC, `cookies()`),
поэтому индустриальный путь — не держать refresh в JS вообще, а в httpOnly
cookie / на сервере (BFF). Это первый мост к BFF-цели плана security-hardening.

**Ограничение (CLAUDE.md §3): backend совместим с Flutter.** Мобильный клиент
шлёт токены в теле/заголовке, cookie ему не подходит. Значит cookie только
**добавляется** для web-клиентов; body-флоу `/auth/refresh` и `/auth/logout`
обязан продолжать работать.

## Decision

Refresh-токен для web-клиентов доставляется и хранится в **httpOnly cookie**;
`access` остаётся в памяти (ADR-0142 без изменений).

**Cookie `avino_rt`:**
- `HttpOnly` — JS не читает (нет XSS-эксфильтрации, нет JS-токена для гонки);
- `Secure` — только HTTPS (в prod; в dev управляется env);
- `SameSite=Lax` — на кросс-сайтовый `fetch/XHR POST` cookie не отправляется →
  `/auth/refresh` (POST) защищён от CSRF без отдельного токена. Прочие эндпоинты
  авторизуются `Authorization: Bearer` (access в памяти), а НЕ cookie, поэтому
  широкой CSRF-поверхности не возникает;
- `Domain=.avino.uz` — общий для портала и `api.avino.uz` (это same-site
  субдомены), чтобы API читал cookie напрямую;
- `Path=/api/v1/auth` — cookie уходит только на auth-эндпоинты, не на весь API;
- `Max-Age` = TTL refresh-токена.

**API принимает refresh из двух источников** (обратная совместимость с mobile):
`req.cookies.avino_rt ?? body.refresh_token`. Нет ни того, ни другого → 400
`VALIDATION_ERROR`. Значение refresh-токена — прежнее (ротация и reuse-detection
в `token.service` не меняются); отдельное серверное хранилище сессий не вводим —
refresh-токен уже является хэндлом сессии.

**Раскатка поэтапная** (одна app-папка = один PR):
- **PR-1 `apps/api`** — additive: `Set-Cookie`/`clearCookie` + чтение cookie в
  refresh/logout; body-флоу не трогаем; деплой первым. Инертен, пока клиент не
  начнёт использовать cookie.
- **PR-2 `apps/client`** — cutover: убрать refresh из `localStorage`, слать
  `/auth/refresh` c `credentials:'include'` без тела; переосмыслить определение
  «есть сессия» (cookie из JS не виден) через пробный silent refresh на старте.
- **PR-3 `apps/web`** — то же для админки (ADR-0045).

Web Locks из #447 остаётся на переходный период как defense-in-depth (перестаёт
иметь значение, когда клиент больше не держит refresh в JS).

## Consequences

Positive:
- XSS не может прочитать/унести refresh-токен.
- Гонка вкладок исчезает архитектурно: JS-токена нет, ротацию делает сервер по
  cookie; каскад `TOKEN_REUSED` → 429 больше не воспроизводится.
- SSR/RSC может выполнить refresh (сервер видит cookie) — задел под серверный
  рендер авторизованного контента и BFF.

Negative / trade-offs:
- Появляется cookie → нужна дисциплина CSRF (закрыто `SameSite=Lax` + POST-only
  refresh; при добавлении cookie-авторизации на мутирующие эндпоинты понадобится
  CSRF-токен).
- Операционная нагрузка: конфиг `Domain`/`Secure` по окружениям, cookie не
  работает на голом IP/несубдоменном хосте (staging учесть).
- Переходный период с двумя путями (cookie + body) — временная сложность в API.
- Клиенту нужен новый способ определять «залогинен» без видимого токена
  (пробный refresh на старте) — усложняет гидрацию.

## Related files

- apps/api/src/main.ts (cookie-parser)
- apps/api/src/config/configuration.ts (authCookie*)
- apps/api/src/auth/auth.controller.ts (Set-Cookie / чтение cookie)
- apps/api/src/auth/dto/refresh-token.dto.ts (refresh_token → optional)
- apps/client/src/store/slices/authSlice.ts, store/api/baseQuery.ts (PR-2)
- apps/web (аналогично, PR-3)

## Related task

- TASK-256
- Связано с ADR-0142 (access в памяти), ADR-0045 (web token storage),
  PR #447 (Web Locks — кросс-вкладочная сериализация refresh)
