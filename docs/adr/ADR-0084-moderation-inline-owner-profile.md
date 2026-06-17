# ADR-0084 — Inline owner profile in the moderation listing list

## Status

Accepted

## Date

2026-06-18

## Context

The admin **Moderation** screen (`apps/web/src/app/admin/moderation/page.tsx`)
shows the review queue and a detail card for the selected listing. The card
exposed almost nothing about *who* created the listing — only what
`GET /api/v1/admin/listings` returned, which carried `owner_id` (a bare UUID) and
`created_at`, but no author name, contact, role, account status, or registration
date.

The obvious way to enrich the author block — calling `GET /api/v1/admin/users/:id`
— is **not available to moderators**: `AdminUsersController` is annotated
`@Roles(UserRole.ADMIN)`, so a `MODERATOR` (who is explicitly allowed to moderate
listings, `@Roles(MODERATOR, ADMIN)` on `AdminListingsController`) would get
`403 FORBIDDEN`. Resolving the author through that endpoint would make the creator
block work for admins only and silently fail for the role that does most of the
moderation.

## Decision

Surface a minimal **inline `owner` profile** directly inside each
`AdminListingListItem` returned by `GET /api/v1/admin/listings`. The moderation
list is already `MODERATOR`/`ADMIN`-accessible, so the same data lights up for
both roles without a second, more privileged request.

The `owner` object carries:
- identity & name: `id`, `display_name`, `first_name`, `last_name`
  (profile fields, `null` when the profile is empty);
- contact: `email`, `phone` (from `users`), `contact_phone` (from `user_profiles`);
- account: `status` (`ACTIVE|BLOCKED|DELETED`), `roles` (codes: `USER`/`OWNER`/…),
  `created_at` (registration date).

Implementation is a single extra relation in the existing `findMany` select
(`owner → { profile, roles }`); no schema change and no migration — all columns
already exist (`users`, `user_profiles`, `user_roles`). The mapping to snake_case
lives in `ModerationService.toOwner`.

This is an **additive, optional response field** → non-breaking under the API
versioning rules (CLAUDE.md §14); it stays in `v1`. The frontend treats `owner`
as optional and renders the creator block only when present, so the web and api
changes can ship independently in either order.

## Consequences

Positive:
- Moderators see who created a listing, when, their contact, role and account
  status at a glance — no navigation away from the queue, no ADMIN-only call.
- One DB round-trip (the existing list query), no N+1, no migration.
- Works identically for `MODERATOR` and `ADMIN`.

Negative / trade-offs:
- The list response is slightly larger (one nested object per row, ≤20 rows/page).
- Author PII (email/phone) now travels in the list payload. Acceptable: the
  endpoint is already staff-only (`MODERATOR`/`ADMIN`) and the same data is
  reachable via `GET /admin/users/:id` for admins.
- `GET /admin/users/:id` stays ADMIN-only; this ADR does not change user-card
  access, only what the moderation queue embeds.

## Related files

- `apps/api/src/moderation/moderation.service.ts` — `AdminListingOwner`,
  `owner` in `AdminListingListItem`, `LISTING_LIST_SELECT.owner`, `toOwner`.
- `apps/api/src/moderation/moderation.service.spec.ts` — owner-mapping tests.
- `apps/api/src/moderation/index.ts` — re-export `AdminListingOwner`.
- `docs/API.md` §16 — `GET /api/v1/admin/listings` response shape.
- `apps/web/src/store/api/adminTypes.ts`, `apps/web/src/app/admin/moderation/page.tsx`
  — frontend consumer (separate PR, one folder = one PR, CLAUDE.md §0/§5).

## Related task

- TASK-220
