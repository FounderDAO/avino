# ADR-0001 — Project stack (NestJS + Next.js + PostgreSQL/PostGIS)

## Status

Accepted

## Date

2026-06-02

## Context

Avino is a real-estate portal for Uzbekistan that must serve a web app, an
admin/moderation panel, and a client-neutral API consumed by a separately
developed Flutter mobile app. The platform needs geo search, an internal chat,
saved searches, notifications, media uploads, and automatic listing translation
into 3 languages (uz/ru/en).

Before any code is written, the technology stack must be fixed so that every
module is built on the same foundation and so the stack cannot drift without an
explicit, reviewed decision. This ADR records the stack that is already
mandated by `docs/CLAUDE.md` (§3) and `docs/ARCHITECTURE.md` (§2).

## Decision

The project is a **monorepo** with the following stack:

Backend (`apps/api/`):

- Node.js + NestJS
- PostgreSQL + PostGIS (geo)
- Prisma ORM
- Redis + BullMQ (cache / queues)
- S3-compatible object storage

Frontend (`apps/web/`):

- Next.js + TypeScript
- RTK Query as the single, centralized API layer (no ad-hoc `fetch()`/`axios`
  in components)

External services:

- Yandex Maps (maps / geo UI)
- Eskiz.uz (SMS / OTP)
- Google Translate API or Yandex Translate API (auto-translation)
- SMTP/email provider (email notifications)

Mobile:

- Flutter app developed by a separate team; the backend API contracts are
  client-neutral and must stay compatible with it.

This stack (ORM, PostGIS, Yandex Maps, Eskiz.uz, RTK Query) cannot be changed,
removed, or replaced without explicit Team Lead approval.

## Consequences

Positive:

- One consistent foundation for backend, web, and mobile from day one.
- Native geo capability via PostGIS; mature queue/cache via Redis + BullMQ.
- Centralized RTK Query layer keeps the web client's API access consistent and
  cache-aware.
- Shared monorepo packages (`packages/shared`) allow types/enums to be reused
  across apps.

Negative / trade-offs:

- Prisma has no native PostGIS type, so geo handling needs raw SQL in places
  (addressed by ADR-0003).
- A monorepo adds build/tooling coordination overhead vs. separate repos.
- Locking the stack means deviations require a formal decision/approval step.

## Related files

- docs/CLAUDE.md (§0, §3, §4, §13)
- docs/ARCHITECTURE.md (§2, §3, §20, §27)
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/adr/ADR-0003-postgis-prisma.md

## Related task

- TASK-DOCS-INIT (initial project tracking documents)
