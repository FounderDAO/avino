# ADR-0067 — Free-text listing search (`q`): pg_trgm trigram + ILIKE

## Status

Accepted

## Date

2026-06-13

## Context

`GET /api/v1/search` accepts a free-text `q` parameter (address/title), but the
backend ignores it (no-op) — the search box without a geo-suggestion does
nothing (TASK-208). We must actually filter results by `q` against listing
text (title / description / address).

Avino content is **trilingual (UZ / RU / EN)**: a listing is authored in one
language and auto-translated into the others, so the searchable text lives in
`listing_translations` (per-language `title`, `description`, …) plus the
language-neutral `address` on `listings`.

Two strategies were considered for the text index/match:

1. **PostgreSQL Full-Text Search (FTS)** — `tsvector` + GIN, `to_tsvector` /
   `plainto_tsquery`, word-level matching with stemming and `ts_rank`.
2. **Trigram** — `pg_trgm` GIN (`gin_trgm_ops`) accelerating `ILIKE '%q%'`,
   substring/fuzzy matching, language-agnostic.

Key constraints:

- Postgres ships FTS dictionaries for `russian` and `english`, but **none for
  Uzbek**. FTS would degrade to the `simple` dictionary for UZ (no stemming) and
  needs per-language `tsvector` columns/config — extra complexity for partial
  multilingual benefit.
- Acceptance criteria require **case-insensitive partial-word** matching
  ("регистр", "частичное слово") — the natural strength of trigram, awkward for
  FTS (which is word/lexeme oriented).
- `pg_trgm` is **already enabled** (migration `20260603120000_enable_extensions`,
  ADR-0003); API.md §9 already describes `q` as "ILIKE/pg_trgm".

## Decision

Use **`pg_trgm` trigram matching with `ILIKE`** for `q`, not Postgres FTS.

- `q` matches when the (LIKE-escaped) term appears as a substring of:
  - `listing_translations.title` **or** `listing_translations.description` in
    **any** language (auto-translated content makes per-language gating
    unnecessary and lossy for MVP), **or**
  - `listings.address`.
  Implemented as `listings.address ILIKE '%q%' OR EXISTS (SELECT 1 FROM
  listing_translations … title/description ILIKE '%q%')`, composed inside the
  existing `buildWhereSql` so it stacks with all other filters and the geo
  endpoints.
- User input is **LIKE-escaped** (`\`, `%`, `_`) before being wrapped in
  `%…%`, so a literal `%` typed by the user cannot act as a wildcard.
- Performance: add **GIN trigram indexes** (`gin_trgm_ops`) via a raw-SQL
  migration (Prisma can't express them, same pattern as the GIST index in
  ADR-0003) on `listing_translations.title`, `listing_translations.description`
  and `listings.address`. `ILIKE '%term%'` with term length ≥ 3 uses the GIN
  index (bitmap index scan); terms shorter than 3 chars fall back to a scan —
  acceptable for MVP.
- The displayed result title/language is still resolved per Accept-Language by
  `TranslationsService` (unchanged); language only affects *display*, not which
  rows match.

## Consequences

Positive:

- Language-agnostic — works for UZ/RU/EN uniformly without per-language
  dictionaries; matches the trilingual auto-translation model.
- Case-insensitive partial/substring matching out of the box (meets acceptance
  criteria) and tolerant of typos.
- Reuses an already-enabled extension and the existing raw-SQL-index pattern;
  filter composes with `sort`/`rooms`/geo via `buildWhereSql`.

Negative / trade-offs:

- No linguistic stemming or relevance ranking (`ts_rank`) — results are
  filtered, not relevance-ordered (ordering stays promotion-priority + `sort`).
- `ILIKE '%term%'` with terms < 3 chars cannot use the trigram index (rare for
  real queries; documented).
- Three additional GIN indexes add write cost on listing/translation mutation
  (acceptable for a read-heavy search workload).
- If word-level relevance ranking is later required, revisit FTS (or a hybrid)
  in a follow-up ADR.

## Related files

- apps/api/src/search/search.service.ts (`buildWhereSql` — `q` predicate)
- apps/api/src/search/dto/search-listings.dto.ts (`q` validation)
- apps/api/prisma/migrations/<new>_add_search_text_trgm_indexes/migration.sql
- apps/api/src/search/search.service.int-spec.ts (q integration tests)
- docs/API.md §9

## Related task

- TASK-208
