# SECURITY.md — Avino

## 1. Purpose & scope

This document defines the security baseline for Avino. It consolidates the
security rules referenced across `ARCHITECTURE.md` (§23/§24), `DB_SCHEMA.md`
(§4, §14, §15) and `API.md` (§3) into one binding contract for the MVP.

```text
Scope:
- Authentication, authorization, session handling.
- Input validation, rate limiting, abuse protection.
- File upload, data protection, secrets, audit logging, transport, CORS.

Not in scope (MVP):
- Online payment security (PaymentsModule deferred — ADR-006).
- Tenant screening data handling (Phase 2).
- Formal pen-test / SOC2-style certification.
```

If this document conflicts with ad-hoc code, this document and
`ARCHITECTURE.md` win. Security-relevant changes require Team Lead approval.

## 2. Threat model (summary)

```text
Assets:
- User PII (phone, email, profile), auth tokens, OTP codes.
- Listings, media, chat messages.
- Admin/moderation actions and audit trail.

Primary actors:
- guest (unauthenticated) — read-only public data.
- user / owner / agent / agency / landlord / property_manager — scoped writes.
- moderator / admin — elevated, fully audited.
- attacker — credential stuffing, OTP brute force, spam/abuse, privilege
  escalation, IDOR, scraping, malicious uploads.

Top risks addressed below:
- OTP brute force / SMS bombing            -> §3, §6
- Token theft / replay                     -> §3
- Broken access control / IDOR             -> §4
- Mass scraping / spam                      -> §6
- Malicious file upload / EXIF leakage      -> §7
- Secret leakage                            -> §8, §12
- Ban evasion via account re-creation       -> §4, §11
```

## 3. Authentication & sessions

```text
- Login is OTP-based (no passwords in MVP): SMS via Eskiz or email via SMTP.
- OTP codes are stored HASHED (never plaintext), with expiry (OTP_TTL) and a
  max attempt counter (OTP_MAX_ATTEMPTS). A consumed/expired OTP is rejected.
- On success the API issues a short-lived JWT access token and a long-lived
  refresh token. Access and refresh are signed with DIFFERENT secrets
  (JWT_ACCESS_SECRET / JWT_REFRESH_SECRET).
- Refresh tokens are stored HASHED and ROTATED on every use. Reuse of an
  already-rotated token revokes the entire session family (family_id) —
  reuse detection (DB_SCHEMA §4 refresh_tokens).
- logout revokes the current refresh token (and may revoke the family).
- Access tokens are sent as `Authorization: Bearer <token>` (API.md §3).
- Tokens carry the minimum claims needed (sub = user id, roles); no secrets
  or PII beyond identifiers in the payload.
```

## 4. Authorization (RBAC)

```text
- Role-based access control. A user may hold multiple roles via user_roles
  (ADR-011). `guest` is implicit (no token, no DB row) and is read-only.
- Every protected route is guarded; authorization is enforced by an RBAC guard
  backed by a documented permission matrix (role -> allowed actions), NOT by
  ad-hoc per-handler checks.
- Ownership checks (object-level): a user may mutate only their own listings,
  chat threads, favorites and saved searches. Prevent IDOR by verifying the
  authenticated subject against owner_id / initiator_id on every object access.
- Admin/moderator-only endpoints (moderation queue, status change, promotion
  activation, user/role management) require the corresponding elevated role
  and are fully audited (§9).
- Public read endpoints (search, listing details) return ONLY ACTIVE listings
  and never leak non-public statuses or private contact data of other users.
```

## 5. Input validation

```text
- All request bodies, query and path params are validated (DTO + whitelist):
  reject unknown fields, enforce types, lengths, ranges and enum membership.
- Enum values must match DB_SCHEMA §3 exactly; invalid values are 400, not
  silently coerced.
- Money/area are validated as non-negative decimals; coordinates within valid
  lat/lng ranges.
- Pagination params are bounded (max page size) to prevent resource exhaustion.
- Prisma parameterizes queries; raw SQL ($queryRaw for PostGIS) MUST use bound
  parameters — never string-concatenate user input into SQL.
- Output is treated as data; the web client escapes rendered content (no
  HTML injection from listing text / chat messages).
```

## 6. Rate limiting & abuse protection

```text
- Global rate limit per client (RATE_LIMIT_WINDOW / RATE_LIMIT_MAX).
- OTP-specific limits: per destination (phone/email) AND per IP, plus a
  resend cooldown (OTP_RESEND_COOLDOWN) to prevent SMS bombing and brute force.
- Login/verify attempts are throttled; repeated failures back off.
- Write-heavy actions (listing creation, chat messages, complaints) are
  rate-limited per user to curb spam.
- Search/scraping: pagination caps + rate limit; no bulk export endpoint.
- Abuse signals feed moderation (complaints) and can lead to status = BLOCKED.
```

## 7. File upload security

```text
- Listing media is stored in S3-compatible storage, never on the app FS
  (DB_SCHEMA §6, ADR-008).
- Validation on upload: MIME allow-list (image/jpeg, image/png, image/webp),
  max file size, max files per listing, basic image-dimension sanity checks.
- EXIF metadata — in particular GPS — is STRIPPED during processing. Listing
  location comes only from the map picker, never from photo EXIF.
- Re-encode/normalize images server-side; generate thumbnails in the
  media_processing_queue worker.
- Target upload path is short-lived presigned PUT URLs with server-side
  post-validation; orphaned S3 objects are reaped by a cleanup job.
- Served media URLs do not expose internal bucket structure or credentials.
```

## 8. Data protection

```text
- Secrets (DB, JWT, S3, Eskiz, SMTP, translation, maps) live in env / secret
  store, NEVER in git. No hardcoded secret defaults in config (ENV.md §2).
- Hashing: OTP codes and refresh tokens are stored hashed; never logged.
- PII minimization: tokens and logs avoid storing raw PII beyond identifiers.
- Transport: all traffic over HTTPS/TLS in production (§10).
- At rest: rely on the managed Postgres/S3 provider's encryption-at-rest;
  do not store secrets or full card/payment data (payments out of MVP).
- Idempotency: promotion activation / future payment callbacks use an
  idempotency key (payment_reference) to prevent double-processing (§DB_SCHEMA 8).
```

## 9. Audit logging

```text
- Security-sensitive actions are written to the generic audit_logs table
  (DB_SCHEMA §12, ADR-004), in addition to domain logs (moderation_logs,
  promotion_logs).
- Minimum audited actions: login, role change, listing status change, listing
  promotion change, delete listing, admin user update.
- Each entry records actor_id (nullable for system), action, entity_type,
  entity_id, ip, user_agent, metadata, created_at.
- Audit logs are append-only in spirit: not editable via the API; retained for
  investigation. Sensitive values (tokens, OTP, secrets) are never stored in
  metadata.
```

## 10. Transport & HTTP headers

```text
- Production serves only over HTTPS/TLS; HTTP is redirected/refused.
- Security headers (set by the API / web edge): HSTS, X-Content-Type-Options,
  X-Frame-Options / frame-ancestors, Referrer-Policy, and a Content-Security-
  Policy on the web app.
- Cookies (if used for web sessions): Secure, HttpOnly, SameSite.
- Do not expose stack traces or internal error details in responses (§11 of
  API.md error format); log them server-side only.
```

## 11. CORS

```text
- The API enables CORS with an explicit allow-list from CORS_ORIGINS
  (comma-separated). No wildcard `*` in production.
- Allowed methods/headers are limited to what the web and mobile clients need
  (Authorization, Content-Type, Accept-Language).
- Mobile (Flutter) calls the API directly with Bearer tokens; CORS applies to
  browser origins (apps/web) only.
```

## 12. Dependency & secrets management

```text
- Keep dependencies updated; track advisories for NestJS, Prisma, Next.js and
  image-processing libs.
- .env is gitignored; .env.example holds placeholders only. Rotate any secret
  that is ever committed or leaked.
- CI/deploy reads secrets from the platform secret store, not from the repo.
- Principle of least privilege for S3 keys, DB users and provider tokens.
```

## 13. Privacy & data retention

```text
- Account deletion is a soft-delete: ACTIVE -> DELETED with deleted_at; the row
  is retained so listings/chat/logs keep referential integrity (ADR-013).
- phone/email uniqueness applies only among non-DELETED accounts, so a user can
  re-register with the same contact. The original contact value is preserved on
  the deleted row for audit/anti-abuse (Variant A). A full PII-scrubbing
  ("right to be forgotten") flow can be added later if required by policy.
- Ban evasion: BLOCKED accounts retain their reserved contact; deleted+re-
  registered accounts get a new id — abuse history can be correlated via
  audit_logs and (optionally) a hashed contact blocklist.
```

## 14. Incident response (baseline)

```text
- On suspected token/secret compromise: rotate the affected secret (JWT secrets
  invalidate all sessions), revoke refresh-token families, and review audit_logs.
- On abuse/spam wave: tighten rate limits, BLOCK offending accounts, and triage
  via the complaints queue.
- Keep a minimal runbook (who rotates what, how to revoke sessions) alongside
  deployment docs as the platform matures.
```

## 15. MVP security checklist

```text
[ ] JWT access/refresh with distinct secrets; refresh rotation + reuse revoke
[ ] OTP hashed, expiry, attempt limit, resend cooldown
[ ] OTP rate limit per destination + per IP; global rate limit
[ ] RBAC guard + permission matrix; object-level ownership checks (no IDOR)
[ ] DTO validation with unknown-field rejection; enum validation
[ ] Parameterized raw SQL for PostGIS ($queryRaw bound params)
[ ] Upload MIME/size/count validation; EXIF/GPS stripped; presigned target
[ ] Secrets only in env/secret store; no defaults; .env gitignored
[ ] audit_logs for all sensitive actions
[ ] HTTPS/TLS in prod; security headers; CORS allow-list (no wildcard)
[ ] Soft-delete + contact reuse rules (ADR-013) enforced
```

## 16. Out of scope for MVP

```text
- Online payment / PCI-related security (payments deferred — ADR-006).
- Tenant screening data protection (Phase 2).
- Advanced bot detection / WAF tuning, formal pen-test, SOC2/ISO certification.
- End-to-end encryption of chat (MVP chat is server-stored, moderator-accessible
  only for complaint/support per ARCHITECTURE §18).
```
