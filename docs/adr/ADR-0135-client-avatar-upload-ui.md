# ADR-0135 — Client avatar upload/display: reuse listing-media upload pattern, blob preview until refetch

## Status

Accepted

## Date

2026-07-06

## Context

ADR-0134 shipped the backend for user avatars: `POST /api/v1/users/me/avatar`
(multipart `file`, ≤10 MiB, `image/jpeg|png|webp`) → `{ avatar_url }`,
`DELETE /api/v1/users/me/avatar`, and read-side resolution of
`avatar_storage_key` (sign-on-read) in `GET /users/me`, `GET /auth/me` and the
chat counterparty. The public portal (`apps/client`) had no way to use it: the
Profile tab showed an initial-letter placeholder with a disabled "Change photo"
button (`TODO(avatar-upload)`), and `ProfileMenu`/`Header` already rendered
`profile.avatar_url` but it was only ever populated by an OAuth photo.

The client hydrates `currentUser` from `GET /auth/me` (`getMe` → `setUser`), and
that endpoint now resolves the uploaded key, so a cache invalidation is enough to
propagate a new avatar everywhere (header, mobile menu, account sidebar).

## Decision

1. Two RTK Query mutations in the existing `usersApi` (no new slice):
   `uploadAvatar` (multipart `FormData`, field `file`) and `deleteAvatar`
   (`DELETE`), both `invalidatesTags: ['Auth','User']` — same convention as the
   other user mutations, so `getMe` refetches and the header updates
   automatically. The upload mirrors `createListingApi.uploadListingMedia`
   exactly: `FormData` with field `file`, no manual `Content-Type`
   (`fetchBaseQuery` forwards the body and the browser sets the boundary).
   Because the server persists the key itself, no follow-up
   `updateProfile({ avatar_url })` is needed.
2. Both endpoints are added to `SUPPRESSED_ENDPOINTS` (the toast middleware): the
   avatar UI validates and reports errors itself (client-side MIME/size checks +
   a manual `toast`), so the global auto-toast must not fire a second, generic
   one — same treatment as `updateProfile`/`uploadListingMedia`.
3. Client-side validation mirrors the backend limits (`image/jpeg|png|webp`,
   10 MiB) and rejects before upload with a localized toast, so a user never
   waits for a 10 MiB round-trip to be told the type/size is wrong.
4. Optimistic **blob** preview: on pick we show `URL.createObjectURL(file)` while
   the request is in flight and keep it until the store's `avatar_url` changes
   (an effect keyed on `user.profile.avatar_url` revokes and clears it). A blob
   URL never expires, so — unlike holding the server's presigned URL in local
   state — there is no flicker to the placeholder and no risk of showing an
   expired presigned URL if the tab stays open past the signed-URL TTL.
5. Display reuses the existing inline `avatar_url ? <img> : initial` pattern from
   `ProfileMenu` (no shared `Avatar` component is introduced): the Profile tab
   gets the real image + upload/remove controls, and the account sidebar user
   card (`AccountLayout`) is upgraded from initial-only to the same pattern for
   consistency. Header and mobile menu already rendered `avatar_url` and needed
   no change.

## Consequences

Positive:

- No new upload strategy or UI primitive — reuses the proven multipart mutation,
  the tag-invalidation refresh, the toast-suppression convention, and the inline
  avatar render already in the codebase.
- One upload/delete automatically refreshes every avatar surface (header, mobile
  menu, sidebar, profile) via `['Auth','User']` invalidation of `getMe`.
- Blob preview is flicker-free and immune to presigned-URL expiry.

Negative / trade-offs:

- Avatar fallback initials are still derived ad hoc per call site
  (`firstName[0]`, `display_name[0]`, `accountName[0]`); this task did not
  introduce a single `initials()` helper — deferred to avoid touching unrelated
  render sites.
- No client-side crop/resize: the raw picked file (up to 10 MiB) is uploaded and
  displayed with `object-cover`. Acceptable for MVP; a cropper can be added later
  without changing the endpoint contract.

## Related files

- `apps/client/src/store/api/usersApi.ts` (`uploadAvatar`, `deleteAvatar`)
- `apps/client/src/store/apiErrorToastMiddleware.ts` (suppress both endpoints)
- `apps/client/src/features/account/Profile.tsx` (upload/remove UI + preview)
- `apps/client/src/features/account/AccountLayout.tsx` (sidebar avatar)
- `apps/client/messages/{en,ru,uz}.json` (avatar UI + toast strings)

## Related ADR

- ADR-0134 — User avatar upload backend (the endpoints this UI consumes).
- ADR-0086 — Listing media sign-on-read (why the server returns a fresh URL).

## Related task

- TASK-248 — User profile avatar (client integration).
