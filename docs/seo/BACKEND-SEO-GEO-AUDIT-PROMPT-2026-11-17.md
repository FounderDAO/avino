You are a senior backend engineer auditing the **Avino.uz** backend for SEO and GEO. GEO means being found and
cited by AI assistants. You work in the backend repository with read access to its code, its configuration and a
**read-only** database connection or replica.

Your job is an audit, not a fix: find facts, measure, and propose changes. Write the report **in Russian**.

## Context — what the frontend already does

- **Site.**
  - https://avino.uz is a Next.js 15 frontend; locales are `/uz`, `/ru` and `/en`.
  - The public API is `https://api.avino.uz/api/v1`, behind Caddy.
  - Images are stored in Cloudflare R2.
- **The frontend (branch `SEO`) already provides:**
  - a self canonical and hreflang per language;
  - H1 and titles built from listing fields in the page language;
  - pagination with links;
  - a sitemap index (cached for 1 hour);
  - one JSON-LD `@graph` per page;
  - `llms.txt`;
  - an IndexNow helper and an authenticated `POST https://avino.uz/api/indexnow` endpoint for the backend.
- **The frontend reads these endpoints:**
  - `GET /search` — keyset cursor, `meta.total`, `meta.next_cursor`, `limit` ≤ 100;
  - `/search/bounds`, `/search/polygon`, `/search/radius`;
  - `GET /listings/:id`;
  - `GET /agents?limit&page` and `GET /agents/:id`;
  - `GET /geo/regions` and `GET /geo/districts`.

  The language is chosen with the `Accept-Language` header.

## Facts measured from outside (2026-11-16/17) — confirm the cause in code and data

1. **Region and district coverage.**
   - `/search?transaction_type=SALE&region_id=<Tashkent city>` returns 28 of 1 236 active sale listings.
   - Only about 45 of 1 785 active listings have a `district_id`.
2. **`district_name` is `null`** for every item in `/search`, in every language. Earlier it was filled.
   `/listings/:id` still returns a district.
3. **There is no `updated_at`** (content change date) in `/search`.
4. **`/listings/:id` returns the same 404 "Listing not found"** for a deleted listing and for an id that never
   existed. A malformed id returns 400.
5. **Photo and avatar URLs are presigned R2 URLs that expire in 1 hour** (`X-Amz-Expires=3600`). `cdn.avino.uz`
   exists, and `S3_PUBLIC_BASE_URL` appears to be unset.
6. **Geo codes.**
   - 197 of 209 district `code` values have a numeric suffix, for example `oqoltin-tumani-125`.
   - 201 districts have `name_en` equal to `name_uz`.
7. **Translation.**
   - Listing `title` is not translated and is usually the author's address in Russian.
   - `language` in the response just echoes the requested language.
   - The Uzbek machine translation of descriptions was Cyrillic earlier and now looks Latin. Verify.
8. **Paging.** `/search` rejects `offset` and `page`. Reaching page N needs N sequential requests: a cold page 21
   takes about 7 s.
9. **API host headers.** `api.avino.uz` has no `robots.txt` (404), no `X-Robots-Tag` and no `Cache-Control` on
   responses. It has gzip and an ETag.
10. **`www.avino.uz`.**
    - `https://www.avino.uz` fails to connect (connection or TLS error).
    - `http://www.avino.uz` redirects to that broken https host.

## Hard rules

- **Read only.** Not allowed:
  - writes, migrations or backfills;
  - queue jobs, deploys or config changes;
  - changes to IndexNow keys.
- **Database.** Run only `SELECT` queries, preferably on a replica. Use `LIMIT` and aggregates. Before any query
  that could be heavy on a large table, run `EXPLAIN` first.
- **Privacy.** Do not paste secrets, tokens, keys, connection strings or personal data (names, phones, e-mails,
  exact addresses of private people) into the report. Use counts and anonymised ids.
- **Evidence for every claim:** a file path and line, a query with its result, or a request with its response.
  Anything you could not check is **НЕ ПРОВЕРЕНО** (not verified), with the reason.
- **Scope.** SEO/GEO only. If you notice a security issue, list it in one line in the "Вне объёма" section (out of
  scope) and do not investigate it further.

---

## Audit sections

For every section report four things:
- **current state**, with evidence;
- **gap**, compared with what the frontend needs (given in each section);
- **proposal** — a concrete change in the API, data or job, with field names;
- **effort** in hours, plus risk.

### A. Listing location data (most important)
1. Count active listings with and without `region_id`, `city_id`, `district_id` and coordinates. Break the counts
   down by `transaction_type` and by creation month.
2. Where in the listing-creation flow are region and district set? Are they optional? Can the client skip them?
3. Can district and region be derived from coordinates? Is there a district polygon or boundary source? Estimate the
   accuracy of a point-in-polygon backfill on a sample of 50 listings that already have a district.
4. Address text: is there a structured address (street, house) separate from the free-text title?

**Frontend needs:** region and district on every active listing, required for new ones.

### B. The search contract
1. Why is `district_name` `null` in `/search` now? Find the commit or change.
2. Is there a field that changes **only** when listing content changes (price, description, photos, status, main
   attributes)? Compare it with a generic `updated_at` that moves on any save.
3. Paging: can `/search` support `offset`/`page`, or a cheap "jump to page N"? What does the cursor encode? Is the
   order stable when listings are added?
4. Is `meta.total` exact? Is it consistent with the items you can actually walk through?
5. Facets: how expensive is one endpoint returning counts of active listings by region, district and type?
6. `sort` values and the default order (promotion tiers): are they stable for crawlers?

**Frontend needs:**
- `district_name` (localised) and `updated_at` (content-based) in `/search` and `/listings/:id`;
- page N without N requests;
- facet counts.

### C. Listing lifecycle and status codes
1. List all statuses (`NEW`, `ACTIVE`, `DRAFT`, `REJECTED`, `DELETED`, `ARCHIVED`, `SOLD`, `RENTED`, any others).
   For each one, give:
   - what `GET /listings/:id` returns (HTTP code and body);
   - whether the item appears in `/search` (with and without `include_closed`).
2. Is there soft delete? Can the API tell "deleted" apart from "never existed"?
3. Edits during moderation: what happens to a published listing when it is edited and waits for review? How long
   do edits wait (median, p90, max over 90 days)?

**Frontend needs:**
- a clear rule per status: 200, 404 or 410;
- a published listing never disappears just because it is waiting for moderation.

### D. Events for IndexNow and cache invalidation
1. List the code points where a listing is created, approved, changed (price, photos, description), closed and
   deleted.
2. Is there an event bus, a queue or a webhook mechanism already?
3. Propose where to call the trigger, and how to batch, retry and log it. Two options:
   - `POST https://avino.uz/api/indexnow` with `Authorization: Bearer <INDEXNOW_SECRET>` and body
     `{"urls":[...]}` — the three language URLs `https://avino.uz/{uz,ru,en}/listing/<id>`;
   - a direct call to `api.indexnow.org`.

   The same event can also revalidate the frontend cache.

### E. Images
1. How are image URLs generated (presigned or public)? Which env variables control this (`S3_PUBLIC_BASE_URL`)?
   Is `cdn.avino.uz` already serving the bucket? Check one object from the outside.
2. Thumbnail sizes, formats (WebP/AVIF), dimensions stored, `Cache-Control` on objects.
3. Agent avatars: same questions.

**Frontend needs:** permanent public URLs with a long cache, plus width and height.

### F. Translations
1. Which fields are machine-translated (title, description, features)? When: on request or on save? Are
   translations cached and stored?
2. Uzbek script: Latin or Cyrillic? Check 20 recent Uzbek descriptions.
3. Is the original language stored? Is it exposed?
4. Titles: the author's free-text title is usually an address. Is there a structured address to show instead?

**Frontend needs:**
- Uzbek in Latin;
- the original language exposed;
- stored translations, not generated on every request.

### G. Geo dictionary
1. Sources for `code`, the `name_*` fields and the region link. Who maintains them?
2. Propose a clean, unique-within-region, immutable `slug` for districts, plus a plan for real English names.
3. Is there an alias table for renamed places, so old slugs can be redirected?

### H. Agents
1. Public fields, how `active_listings_count` is computed, the avatar URL type.
2. Is `about` translated?
3. Paging limits.

### I. Performance and limits
1. p50, p95 and p99 latency for `/search`, `/listings/:id`, `/geo/*` and `/agents` over 7 days, from logs or APM.
   Find the slowest queries and missing indexes (`EXPLAIN` only).
2. Rate limits: will a crawler-style walk (about 20 sequential `/search?limit=100` pages each hour) be throttled?
3. Response caching headers: what is safe to cache publicly, and for how long?

### J. API host and infrastructure (read config only)
1. Caddy config:
   - redirects for `www.avino.uz` and http → https;
   - TLS certificate coverage for `www`;
   - compression (br/gzip);
   - HSTS.
2. `api.avino.uz`: propose a `robots.txt` with `Disallow: /` and `X-Robots-Tag: noindex` on all responses.
3. Access logs: is the user agent logged? Count requests from Googlebot, YandexBot, bingbot, GPTBot, ClaudeBot and
   PerplexityBot over 7 days, if the logs exist.

### K. Data exposure that affects SEO decisions (facts only)
- Does the public API return exact coordinates and full street addresses for private (owner) listings? Give counts
  only.
- The owner will decide what to do. Do not propose a privacy policy.

---

## Report (in Russian, one Markdown document)

1. **Итоги — 7 пунктов:**
   - главный блокер;
   - самые быстрые победы (≤ 2 ч);
   - что сломано сейчас (регрессии);
   - что требует решения владельца;
   - оценка общего объёма.
2. **Таблица задач** — колонки: `#` | `Задача` | `Раздел` | `Приоритет (P0–P3)` | `Оценка, ч` | `Риск` | `Зависимости` |
   `Как проверить`.

   Используйте коды BE-1…BE-13 из `docs/seo/SEO-GEO-WORKPLAN-2026-11-17.md`, где они подходят, и добавьте новые
   задачи, если они найдены.
3. **Разделы A–K** — по четыре блока в каждом:
   - текущее состояние с доказательствами;
   - разрыв;
   - предложение (поля, эндпоинты, джобы);
   - оценка.
4. **Изменения контракта API** — точная схема: новые и изменённые поля для `/search`, `/listings/:id`,
   `/geo/districts` и `/agents`, с примерами JSON.
5. **НЕ ПРОВЕРЕНО** — пункт и причина.
6. **Вне объёма** — одна строка на каждую замеченную проблему, без подробностей.

Do not change anything. Do not run writes. The team will decide the fixes after reading the report.
