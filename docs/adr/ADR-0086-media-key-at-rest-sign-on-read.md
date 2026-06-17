# ADR-0086 — Listing media: store the object key at rest, sign the URL on read

## Status

Accepted

## Date

2026-06-18

## Context

Listing photos live in Cloudflare R2 (ADR-0082). In dev the bucket is **private**
(`S3_PUBLIC_BASE_URL` unset), so `UploadsService.getObjectUrl(key)` returns a
**presigned GET URL** whose lifetime is `S3_SIGNED_URL_TTL` (default **3600 s = 1 h**).

The bug: the presigned URL was generated **once, at upload time**, and the whole
signed string was persisted in `listing_media.url`. Every read path
(`GET /listings/:id`, `/listings/:id/media`, `/listings/mine`, `/search`, and — via
`GET /listings/:id` — the moderation queue and the client edit form) returned that
stored string **verbatim, never re-signing it**.

Consequence: a photo was viewable only within one hour of upload. After the TTL
expired, R2 answered `403 ExpiredRequest` (`Request has expired`) for every `<img>`,
so photos "disappeared" simultaneously in the listing detail, the moderation card,
and the edit form — exactly the user-reported symptom. Reproduced live: a photo
uploaded at `20:59:20Z` had `X-Amz-Expires=3600`; at `22:32Z` (93 min later) the
stored URL returned `HTTP 403 ExpiredRequest`.

This is a flaw in the **URL-handling** half of ADR-0082 (which chose R2 and the
private/presigned dev mode), not in the provider choice itself.

## Decision

Store a **stable object key at rest** and **generate the delivery URL on every read**.

1. New column `listing_media.storage_key` (nullable `TEXT`, Prisma `storageKey String?`).
   On upload, persist the S3/R2 object key returned by `UploadsService.upload()`.
2. New `UploadsService.resolveMediaUrl(storageKey, fallbackUrl)`: returns
   `getObjectUrl(storageKey ?? extractKey(fallbackUrl))`. In private mode this is a
   **freshly signed** presigned URL; in public mode (`S3_PUBLIC_BASE_URL`) a permanent
   CDN URL. Because it is computed per request, the signature cannot outlive the TTL.
3. Every read path resolves media URLs through `resolveMediaUrl` instead of echoing
   the stored value — listing detail `media[]`, `mine`/`search` cover thumbnails, and
   the `listing-media` endpoints. `thumbnail_url`, when present, is re-signed from its
   own URL.
4. **No data backfill.** Legacy rows keep `storage_key = NULL`; the read path falls
   back to `extractKey(url)`, which recovers the key from the stored (now-expired) URL
   by stripping the query string / base prefix. This works for both presigned and
   public URLs and avoids a backfill that would have to hard-code an
   environment-specific bucket name. New uploads populate `storage_key` explicitly.

The persisted `listing_media.url` is kept (still written on upload) for backward
compatibility and as the legacy fallback source; it is no longer read for delivery.

## Consequences

Positive:
- Presigned URLs can no longer expire in transit — they are minted per request.
- Fixes detail, moderation, edit-form, `mine`, and `search` in one backend change;
  no client changes.
- Works for already-uploaded photos with zero backfill (legacy fallback via
  `extractKey`). Verified live: `GET /listings/:id` for a legacy row (`storage_key`
  NULL, stored URL expired) returned a URL whose `X-Amz-Date` equalled the request
  time and fetched `HTTP 200` from R2.
- Forward-compatible with the production public/CDN cutover (ADR-0082): in public
  mode `resolveMediaUrl` returns the permanent URL with no signing.

Negative / trade-offs:
- Each read re-signs N media URLs. Signing is a local HMAC (no network), so the cost
  is negligible, but it is per-request work that the old baked URL avoided.
- `listing_media.url` now holds a stale, unused signed string for rows created before
  the cutover; the column is retained rather than dropped to avoid a destructive
  migration. Dropping/repurposing it is deferred.
- Thumbnails are re-signed from their own stored URL (no dedicated key column); fine
  while `thumbnail_url` is always null in MVP. When the media-processing worker starts
  emitting thumbnails, it should persist their key too.

## Related files

- `apps/api/prisma/schema.prisma` (`ListingMedia.storageKey`)
- `apps/api/prisma/migrations/20260618000000_listing_media_storage_key/migration.sql`
- `apps/api/src/uploads/uploads.service.ts` (`resolveMediaUrl`)
- `apps/api/src/listing-media/listing-media.service.ts` (persist key, sign on read)
- `apps/api/src/listings/listings.service.ts` (detail + `mine` signing)
- `apps/api/src/search/search.service.ts` (cover signing)
- `apps/api/src/{listings,search}/{listings,search}.module.ts` (import `UploadsModule`)

## Related ADR

- ADR-0082 — Cloudflare R2 for object storage (this refines its private/presigned
  URL handling).

## Related task

- No dedicated TASKS.md entry; originated from a direct bug report (photos vanished
  from moderation and the edit form ~1 h after upload).
