# ADR-0082 — Cloudflare R2 for object storage (S3-compatible, provider-agnostic)

## Status

Accepted

## Date

2026-06-17

## Context

Avino stores listing photos in S3-compatible object storage; files live only in the
bucket, never on the API filesystem (CLAUDE.md §3, ARCHITECTURE §14, DB_SCHEMA §6).
`UploadsService` is intentionally provider-agnostic: it reads namespaced `S3_*` env
(`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID/SECRET`,
`S3_FORCE_PATH_STYLE`, `S3_PUBLIC_BASE_URL`, `S3_SIGNED_URL_TTL`) and works with any
S3 API backend (AWS S3, Cloudflare R2, Hetzner Object Storage, DigitalOcean Spaces,
MinIO).

We needed to pick the concrete provider for the listing-photo workload. The portal
serves many images to a CIS audience, so **egress** is the dominant storage cost.
AWS S3 charges ~$0.09/GB egress; Cloudflare R2 charges $0 egress and exposes an
S3-compatible API.

## Decision

Adopt **Cloudflare R2** as the object-storage provider.

Rationale:
- **Zero egress** — the main driver for an image-heavy portal.
- **S3-compatible API** — no code change; provider is selected purely via env
  (`S3_ENDPOINT` = `https://<account_id>.r2.cloudflarestorage.com`, `S3_REGION=auto`,
  path-style). The storage layer stays provider-agnostic, so switching
  provider/account = env + DNS only.
- **Cloudflare CDN** — edge cache and good latency for the CIS audience.

Environment split:
- **dev (now):** bucket `avinodev` on a personal Cloudflare account, default (non-EU)
  jurisdiction, scoped API token, **private/presigned** mode (`S3_PUBLIC_BASE_URL`
  unset → `getObjectUrl` returns signed GET URLs).
- **production (at release):** recreated on the **client's** Cloudflare account
  (client billing), scoped token, public access via a custom domain; the dev token is
  revoked. The full cutover procedure + troubleshooting is documented in
  `docs/GUIDE_S3.md`, with a connectivity smoke (`apps/api/r2-smoke.cjs`).

This change is **documentation + a dev tool only** — no runtime code change. The
public/CDN mode (`S3_PUBLIC_BASE_URL` + custom domain) and the clean R2 ACL handling
(`S3_DISABLE_ACL` flag, GUIDE §6.2) are deferred to the production rollout.

## Consequences

Positive:
- Zero egress for the image-heavy workload; storage cost also lower than S3.
- S3-compatible → trivial migration; layer remains provider-agnostic (env-only swap).
- Cloudflare CDN for CIS latency.
- Production cutover is a checklist (`GUIDE_S3.md`) + a reusable connectivity smoke,
  not a research task.
- Verified end-to-end locally: `r2-smoke.cjs` green, and the full app flow (admin OTP
  login → create listing → `POST /listings/:id/media` → object in R2 → presigned GET
  `200` byte-identical → `DELETE` `204` → object `404`).

Negative / trade-offs:
- R2 has **no per-object ACL**; public access is bucket-level. The code still sends
  `ACL: public-read` in public mode, which R2 ignores; the clean fix (`S3_DISABLE_ACL`
  flag) is described in GUIDE §6.2 but **not yet implemented**.
- No parity with S3 storage classes (Glacier/deep archive); weaker lifecycle rules.
- R2 uses **jurisdiction-specific endpoints** (`.eu.` vs default) — a mismatch returns
  `NoSuchBucket` for an existing bucket (documented in GUIDE §11; hit during dev).
- Public/CDN mode (clean permanent URLs, zero-egress via custom domain) is deferred;
  dev currently runs private/presigned.

## Related files

- `docs/GUIDE_S3.md` (production runbook + troubleshooting)
- `apps/api/r2-smoke.cjs` (connectivity smoke)
- `apps/api/src/uploads/uploads.service.ts` (provider-agnostic uploads)
- `apps/api/src/config/configuration.ts`, `apps/api/src/config/env.validation.ts`
- `deploy/prod.env.example`, `docs/ENV.md` §9

## Related task

- No dedicated TASKS.md entry; originated from a direct request. Documentation and the
  smoke script landed in PR #172.
