# ADR-0134 — User avatar upload: separate storage-key column, sign-on-read

## Status

Accepted

## Date

2026-07-06

## Context

There was no way for a user to upload a profile photo. `user_profiles.avatar_url`
existed but was write-only from two sources:

- `PATCH /api/v1/users/me/profile` accepted an already-hosted `avatar_url` string
  (`UpdateProfileDto.avatar_url`, `@IsUrl`) — the client had to host the image
  itself elsewhere.
- Google/Apple sign-in writes the OAuth provider's photo URL into the same column
  (`google-auth.service.ts` → `avatarUrl: payload.picture`).

With no upload endpoint, every real user ends up with `avatar_url: null` and the
client falls back to an initial-letter placeholder.

Listing photos already solved the analogous problem for `listing_media`
(TASK-060/061, ADR-0086): files live in S3-compatible storage (Cloudflare R2),
the DB keeps a stable **object key**, and the delivery URL is **(re-)signed on
every read** (`UploadsService.resolveMediaUrl` / `getObjectUrl`) so a presigned
URL can never be served past its TTL. Avatars should follow the same pattern
instead of inventing a second storage strategy.

The complication specific to avatars: `avatar_url` is **already occupied** by a
different, valid producer (the OAuth provider's photo). Writing an uploaded
file's key into that same column would either overwrite a working provider photo
on next OAuth login, or require teaching the OAuth write-path to check "did the
user upload their own photo" before overwriting — extra coupling between two
unrelated features.

## Decision

1. New nullable column `user_profiles.avatar_storage_key` (Prisma
   `UserProfile.avatarStorageKey`), separate from `avatarUrl`. `avatarUrl` keeps
   its existing meaning and existing writers (profile `PATCH`, Google/Apple
   sign-in) untouched.
2. `POST /api/v1/users/me/avatar` (multipart, field `file`) — proxy upload to
   R2 via the existing `UploadsService`, same allow-list (`image/jpeg`,
   `image/png`, `image/webp`) and size limit (10 MiB) as `ListingMediaService`.
   Persists the returned object key into `avatar_storage_key` (`upsert`, since a
   profile row may not exist yet — OTP login doesn't create one, ADR-0010).
   Returns `{ avatar_url: <freshly signed URL> }`.
3. `DELETE /api/v1/users/me/avatar` — clears `avatar_storage_key` (idempotent,
   `204` even if there was nothing to delete) and best-effort deletes the R2
   object, mirroring `ListingMediaService.remove`: the DB write is the source of
   truth, an S3 delete failure is logged and swallowed rather than failing the
   request.
4. Read-side priority, `avatar_storage_key` over `avatarUrl`:
   `avatar_storage_key` set → sign a fresh URL via `UploadsService.getObjectUrl`
   (ADR-0086 sign-on-read, same reasoning: a URL minted at request time cannot
   expire in transit); otherwise fall back to `avatarUrl` as-is (external,
   permanent provider URL, or `null`). Centralized in
   `apps/api/src/users/avatar-url.util.ts::resolveAvatarUrl`, used by
   `UsersService.getMe`/`updateMe` (`/api/v1/users/me`).

## Consequences

Positive:

- Reuses the proven upload/storage pattern (R2 + `UploadsService` + sign-on-read)
  instead of a second one; same MIME/size limits as listing media.
- Zero risk of an uploaded avatar being silently overwritten by a subsequent
  Google/Apple login (different column), and zero risk of an uploaded avatar
  clobbering a provider photo.
- No backfill needed — existing rows have `avatar_storage_key = NULL` and simply
  keep resolving to `avatarUrl`/`null` as before.

Negative / trade-offs:

- Two columns for "the user's avatar" (`avatarUrl`, `avatarStorageKey`) with a
  priority rule the reader must know — slightly more surface than a single
  column, but avoids the coupling/overwrite hazard above.
- `GET /api/v1/auth/me` (`AuthService.getMe`) and the chat thread counterparty
  (`ChatService.counterpartiesByIds`) still read `profile.avatarUrl` directly
  and do **not** yet resolve `avatar_storage_key`. This task's edit scope was
  restricted to `apps/api/src/users/**` + Prisma; wiring those two read sites is
  deferred to a follow-up change (`resolveAvatarUrl` is already exported and
  ready to be reused there).
- Best-effort R2 delete (upload-replace and `DELETE`) can leave an orphaned
  object if it fails; no dedicated cleanup job scans the `users/*/avatar/*`
  prefix yet (`media-cleanup` currently only sweeps listing media).

## Related files

- `apps/api/prisma/schema.prisma` (`UserProfile.avatarStorageKey`)
- `apps/api/prisma/migrations/20260706000000_add_profile_avatar_storage_key/migration.sql`
- `apps/api/src/users/avatar-url.util.ts` (`resolveAvatarUrl`)
- `apps/api/src/users/users.service.ts` (`uploadAvatar`, `deleteAvatar`, `toMe`)
- `apps/api/src/users/users.controller.ts` (`POST`/`DELETE /users/me/avatar`)
- `apps/api/src/users/users.module.ts` (imports `UploadsModule`)
- `apps/api/src/users/users.service.spec.ts`

## Related ADR

- ADR-0086 — Listing media: store the object key at rest, sign the URL on read
  (the pattern this ADR reuses for avatars).
- ADR-0010 — OTP login does not create a profile row (why `uploadAvatar` upserts).

## Related task

- TASK-248 — User profile avatar upload.
