# DB_SCHEMA.md — Avino

## 1. Purpose

This document defines the baseline database schema for Avino — a real-estate
portal for Uzbekistan. It is the schema-level companion to `ARCHITECTURE.md`
and the binding decisions recorded there (ADR-001…012, section 28).

```text
Scope:
- Logical table list, columns, types, relations, indexes and constraints.
- PostgreSQL + PostGIS + Prisma conventions.
- Rules that the DB layer must guarantee (integrity, promotion, chat, geo).

Not in scope:
- Backend application code (services, controllers, repositories).
- Final migration SQL (this is the contract; migrations are generated later).
```

This document is the source of truth for the data layer. If it conflicts with
ad-hoc code, this document and `ARCHITECTURE.md` win. Changes that break the
v1 API contract (renaming/removing columns, changing enum values) require a
new API version (see `ARCHITECTURE.md` §5) and Team Lead approval.

## 2. Global conventions

```text
Naming
- Tables: snake_case, plural (users, listing_translations, chat_threads).
- Columns: snake_case (created_at, initiator_id, filters_json).
- Prisma models are PascalCase and map to tables via @@map / @map.

Primary keys
- Every table has `id uuid` PRIMARY KEY, default gen_random_uuid().
- Prisma: id String @id @default(uuid()) @db.Uuid

Timestamps
- created_at timestamptz NOT NULL DEFAULT now()
- updated_at timestamptz NOT NULL (maintained by Prisma @updatedAt)
- All timestamps are timestamptz stored in UTC. Never store naive local time.

Money & measures (binding — ADR-002)
- price:  numeric(14,2)  (Prisma Decimal @db.Decimal(14,2)) — NEVER float.
- area:   numeric(10,2)  (Prisma Decimal) — NEVER float.
- currency stored per row as enum (UZS, USD). No FX conversion in MVP.

Geo (binding — ADR-001)
- latitude / longitude: numeric(9,6) (Prisma Decimal) — editable source.
- location: PostGIS geography(Point, 4326) — derived, kept in sync on write;
  source of truth for geo queries. See §14 Prisma notes.

Enums
- Implemented as PostgreSQL enum types (Prisma enum). Enum VALUES are part of
  the v1 contract: adding a value is non-breaking; renaming/removing is
  breaking and requires v2.

Foreign keys
- FK columns are <entity>_id uuid.
- Default ON DELETE behaviour is documented per relation. User-generated
  content is never hard-deleted while referenced; listings use soft-delete
  via status = DELETED (ARCHITECTURE §22 soft-delete note).

JSON
- Structured JSON columns use jsonb (e.g. saved_searches.filters_json,
  audit_logs.metadata).

Soft delete
- Listings: logical via status. Read paths (search, favorites, chat creation)
  MUST exclude DELETED and other non-public statuses explicitly.
```

## 3. Enums

```text
transaction_type       SALE | RENT
property_type          APARTMENT | HOUSE | NEW_BUILDING | LAND | COMMERCIAL
listing_status         NEW | ACTIVE | DRAFT | REJECTED | DELETED | ARCHIVED | SOLD | RENTED
user_status            ACTIVE | BLOCKED | DELETED         (ACTIVE -> DELETED is soft-delete)
language               UZ | RU | EN
currency               UZS | USD
promotion_type         NORMAL | TOP | VIP                 (priority VIP > TOP > NORMAL)
promotion_status       PENDING_PAYMENT | ACTIVE | EXPIRED | CANCELLED | REFUNDED
payment_status         NOT_REQUIRED | PENDING | PAID | FAILED | REFUNDED
media_type             IMAGE                              (VIDEO is Phase 2, out of MVP)
translation_source     USER | GOOGLE | YANDEX
moderation_action      APPROVE | SEND_TO_DRAFT | REJECT | DELETE
promotion_admin_action ACTIVATE_VIP | ACTIVATE_TOP | CANCEL_PROMOTION | EXTEND_PROMOTION
notification_type      SAVED_SEARCH_NEW_LISTING | FAVORITE_PRICE_DROP | NEW_CHAT_MESSAGE
                       | LISTING_MODERATION_STATUS_CHANGED | NEW_LEAD
                       | PROMOTION_ACTIVATED | PROMOTION_EXPIRED
notification_channel   EMAIL | PUSH | IN_APP
notification_status    PENDING | SENT | FAILED | READ
device_platform        ANDROID | IOS | WEB
otp_channel            SMS | EMAIL
otp_purpose            LOGIN
complaint_status       NEW | IN_REVIEW | RESOLVED | REJECTED
```

```text
Role codes (seeded into `roles`, NOT a Postgres enum — see §4):
USER | OWNER | AGENT | AGENCY | LANDLORD | PROPERTY_MANAGER | MODERATOR | ADMIN

`GUEST` is NOT a role value and is NOT stored anywhere (ADR-011). It is the
implicit state of an unauthenticated request.

audit_logs.action is a free-form varchar (extensible), not an enum, so new
auditable actions do not require a migration (ADR-004).
```

## 4. Core identity schema

```text
users
- id                  uuid PK
- phone               varchar(20)  NULL   (E.164; required for SMS login)
- email               varchar(255) NULL   (required for email login)
- is_phone_verified   boolean NOT NULL default false
- is_email_verified   boolean NOT NULL default false
- status              user_status NOT NULL default 'ACTIVE'  (ACTIVE|BLOCKED|DELETED)
- default_language    language NOT NULL default 'RU'
- last_login_at       timestamptz NULL
- deleted_at          timestamptz NULL   (set when status -> DELETED)
- created_at          timestamptz NOT NULL
- updated_at          timestamptz NOT NULL
Notes:
- At least one of (phone, email) must be present (CHECK, see §15).
- No password column in MVP — auth is OTP-based (SMS/email), ARCHITECTURE §6.
- Uniqueness of phone/email is enforced by PARTIAL UNIQUE indexes scoped to
  non-deleted accounts (status <> 'DELETED'), NOT a plain UNIQUE column. A
  soft-deleted account therefore does not block re-registration with the same
  phone/email, while the original contact value is PRESERVED on the deleted row
  for history/audit (Variant A — ADR-013). Prisma cannot express partial unique
  indexes, so phone/email are NOT @unique in the Prisma model; the indexes are
  created via raw SQL migration (same pattern as the GIST index — see §14).
- Soft delete: ACTIVE -> DELETED sets deleted_at; the row is retained so
  listings, chat threads and logs keep referential history. A new registration
  with the same contact creates a NEW user (new id). BLOCKED is NOT DELETED, so
  a blocked account still reserves its phone/email.
```

```text
user_profiles
- id                  uuid PK
- user_id             uuid FK -> users(id) ON DELETE CASCADE, UNIQUE (1:1)
- first_name          varchar(100) NULL
- last_name           varchar(100) NULL
- display_name        varchar(150) NULL
- avatar_url          text NULL
- contact_phone       varchar(20) NULL
- preferred_language  language NULL
- created_at          timestamptz NOT NULL
- updated_at          timestamptz NOT NULL
```

```text
roles  (seeded dictionary)
- id                  uuid PK
- code                varchar(40) UNIQUE NOT NULL   (one of the role codes, §3)
- description         text NULL
Notes:
- Fixed seed set; `GUEST` is intentionally absent.
```

```text
user_roles  (many-to-many; a user may hold several roles — ADR-011)
- id                  uuid PK
- user_id             uuid FK -> users(id) ON DELETE CASCADE
- role_id             uuid FK -> roles(id) ON DELETE RESTRICT
- granted_by          uuid FK -> users(id) NULL   (admin who assigned)
- created_at          timestamptz NOT NULL
Constraints:
- UNIQUE (user_id, role_id)
Indexes:
- (user_id), (role_id)
```

```text
otp_codes
- id                  uuid PK
- user_id             uuid FK -> users(id) ON DELETE CASCADE NULL  (null pre-signup)
- channel             otp_channel NOT NULL      (SMS | EMAIL)
- destination         varchar(255) NOT NULL     (phone or email the code went to)
- purpose             otp_purpose NOT NULL default 'LOGIN'
- code_hash           varchar(255) NOT NULL     (HASHED, never plaintext)
- attempts            smallint NOT NULL default 0
- expires_at          timestamptz NOT NULL
- consumed_at         timestamptz NULL
- created_at          timestamptz NOT NULL
Indexes:
- (destination, purpose), (expires_at)
Security: OTP request & verification are rate-limited (per destination, per IP).
```

```text
refresh_tokens
- id                  uuid PK
- user_id             uuid FK -> users(id) ON DELETE CASCADE
- token_hash          varchar(255) NOT NULL     (HASHED; rotated on use)
- family_id           uuid NOT NULL             (session family for reuse detection)
- user_agent          text NULL
- ip                  varchar(64) NULL
- expires_at          timestamptz NOT NULL
- revoked_at          timestamptz NULL
- created_at          timestamptz NOT NULL
Indexes:
- (user_id), (token_hash), (family_id)
Security: rotation on use; reuse of a rotated token revokes the whole family.
```

## 5. Agency schema

```text
agencies
- id                  uuid PK
- name                varchar(200) NOT NULL
- slug                varchar(200) UNIQUE NOT NULL
- description         text NULL
- logo_url            text NULL
- phone               varchar(20) NULL
- email               varchar(255) NULL
- city_id             uuid FK -> cities(id) NULL
- is_verified         boolean NOT NULL default false
- created_at          timestamptz NOT NULL
- updated_at          timestamptz NOT NULL
Note: `agencies` is the ORGANIZATION entity. The `agency` ROLE (in roles) means
"agency administrator" and is distinct from this entity (ADR-011).
```

```text
agency_members
- id                  uuid PK
- agency_id           uuid FK -> agencies(id) ON DELETE CASCADE
- user_id             uuid FK -> users(id) ON DELETE CASCADE
- member_role         varchar(40) NOT NULL default 'AGENT'  (AGENT|ADMIN)
- created_at          timestamptz NOT NULL
Constraints:
- UNIQUE (agency_id, user_id)
Indexes:
- (agency_id), (user_id)
```

## 6. Listings schema

```text
listings
- id                   uuid PK
- reference            int NOT NULL UNIQUE  (public human-readable no., seq START 100000; ADR-0137)
- owner_id             uuid FK -> users(id) ON DELETE RESTRICT   (creator)
- agency_id            uuid FK -> agencies(id) ON DELETE SET NULL NULL
- transaction_type     transaction_type NOT NULL
- property_type        property_type NOT NULL
- status               listing_status NOT NULL default 'NEW'
- original_language    language NOT NULL          (language the author wrote in)
- price                numeric(14,2) NOT NULL
- currency             currency NOT NULL
- area                 numeric(10,2) NULL
- rooms                smallint NULL
- floor                smallint NULL
- total_floors         smallint NULL
- year_built           smallint NULL
- address              varchar(500) NULL
- city_id              uuid FK -> cities(id) NULL
- district_id          uuid FK -> districts(id) NULL
- latitude             numeric(9,6) NULL
- longitude            numeric(9,6) NULL
- location             geography(Point,4326) NULL        (derived; see §14)
- promotion_type       promotion_type NOT NULL default 'NORMAL'  (READ CACHE — §8)
- promotion_started_at timestamptz NULL                  (READ CACHE)
- promotion_expires_at timestamptz NULL                  (READ CACHE)
- published_at         timestamptz NULL                  (set when first ACTIVE)
- created_at           timestamptz NOT NULL
- updated_at           timestamptz NOT NULL
Indexes:
- UNIQUE (reference)
- (status), (property_type), (transaction_type), (price), (city_id),
  (district_id), (owner_id), (agency_id)
- (promotion_type), (promotion_expires_at)
- GIST (location)  -- created via raw SQL migration, see §14
- composite for default search: (status, promotion_type, created_at desc, id desc)
Notes:
- promotion_* columns are a denormalized READ CACHE of the active row in
  listing_promotions. listing_promotions is the source of truth (§8, ADR-006).
- Non-translatable structured fields live here; translatable text lives in
  listing_translations.
```

```text
listing_translations   (ADR-005)
- id                  uuid PK
- listing_id          uuid FK -> listings(id) ON DELETE CASCADE
- language            language NOT NULL
- title               varchar(255) NOT NULL
- description         text NULL
- address_note        text NULL
- features_text       text NULL
- source              translation_source NOT NULL   (USER | GOOGLE | YANDEX)
- is_auto_translated  boolean NOT NULL default false
- created_at          timestamptz NOT NULL
- updated_at          timestamptz NOT NULL
Constraints:
- UNIQUE (listing_id, language)
Indexes:
- (listing_id)
- optional pg_trgm GIN on (title) / (description) for text search (ARCHITECTURE §12)
Rules (ADR-005):
- The author/original-language row has is_auto_translated=false, source=USER.
- Auto rows (GOOGLE/YANDEX) are generated AFTER the listing becomes ACTIVE and
  INHERIT the listing's visibility/status — they are never independently
  publishable. Text search targets the row matching the user's language with
  fallback to original_language.
```

```text
listing_media   (ADR-008)
- id                  uuid PK
- listing_id          uuid FK -> listings(id) ON DELETE CASCADE
- url                 text NOT NULL
- thumbnail_url       text NULL
- sort_order          smallint NOT NULL default 0
- type                media_type NOT NULL default 'IMAGE'
- width               int NULL
- height              int NULL
- size_bytes          int NULL
- created_at          timestamptz NOT NULL
Indexes:
- (listing_id, sort_order)
Rules (ADR-008):
- Files are stored in S3-compatible storage, never on the app server FS.
- EXIF metadata (in particular GPS) MUST be stripped during processing
  (process_uploaded_image). Listing location comes only from map-picked
  coordinates, never from photo EXIF.
- Allowed MVP MIME types: image/jpeg, image/png, image/webp. VIDEO is Phase 2.
```

```text
listing_features  (join to feature dictionary; see §13)
- id                  uuid PK
- listing_id          uuid FK -> listings(id) ON DELETE CASCADE
- feature_id          uuid FK -> features(id) ON DELETE RESTRICT
Constraints:
- UNIQUE (listing_id, feature_id)
Indexes:
- (listing_id), (feature_id)
```

## 7. Moderation schema

All listings pass through the moderation queue (ARCHITECTURE §9). Every
moderation action is logged.

```text
moderation_logs
- id                  uuid PK
- listing_id          uuid FK -> listings(id) ON DELETE CASCADE
- moderator_id        uuid FK -> users(id) ON DELETE SET NULL NULL
- action              moderation_action NOT NULL  (APPROVE|SEND_TO_DRAFT|REJECT|DELETE)
- old_status          listing_status NULL
- new_status          listing_status NULL
- reason              text NULL
- created_at          timestamptz NOT NULL
Indexes:
- (listing_id), (moderator_id), (created_at)
```

```text
complaints
- id                  uuid PK
- listing_id          uuid FK -> listings(id) NOT NULL ON DELETE CASCADE
- reporter_id         uuid FK -> users(id) ON DELETE SET NULL
- reason              varchar(120) NOT NULL
- details             text NULL
- status              complaint_status NOT NULL default 'NEW'
- handled_by          uuid FK -> users(id) NULL
- handled_at          timestamptz NULL
- created_at          timestamptz NOT NULL
- updated_at          timestamptz NOT NULL
Indexes:
- (status), (listing_id)
```

## 8. Promotion schema

Binding rules — ADR-006 / ARCHITECTURE §10.

```text
listing_promotions   (SOURCE OF TRUTH / ledger)
- id                  uuid PK
- listing_id          uuid FK -> listings(id) ON DELETE CASCADE
- user_id             uuid FK -> users(id) ON DELETE SET NULL NULL   (who requested it)
- type                promotion_type NOT NULL     (TOP | VIP; NORMAL means "no promo")
- status              promotion_status NOT NULL default 'PENDING_PAYMENT'
- period_days         smallint NOT NULL           (7 | 14 | 30)
- starts_at           timestamptz NULL
- expires_at          timestamptz NULL
- price               numeric(14,2) NULL          (Decimal — never float)
- currency            currency NULL
- payment_status      payment_status NOT NULL default 'NOT_REQUIRED'
- payment_provider    varchar(40) NULL            (stub in MVP)
- payment_reference   varchar(120) NULL           (idempotency key — §15)
- created_at          timestamptz NOT NULL
- updated_at          timestamptz NOT NULL
Constraints:
- PARTIAL UNIQUE (listing_id) WHERE status = 'ACTIVE'
    -> at most ONE active promotion per listing (ADR-006).
- PARTIAL UNIQUE (payment_reference) WHERE payment_reference IS NOT NULL  (idempotency).
Indexes:
- (listing_id), (status), (expires_at)
```

```text
promotion_logs   (admin action audit for promotions)
- id                    uuid PK
- listing_promotion_id  uuid FK -> listing_promotions(id) ON DELETE SET NULL
- listing_id            uuid FK -> listings(id) ON DELETE CASCADE
- admin_id              uuid FK -> users(id) ON DELETE SET NULL
- action                promotion_admin_action NOT NULL
- old_type              promotion_type NULL
- new_type              promotion_type NULL
- old_expires_at        timestamptz NULL
- new_expires_at        timestamptz NULL
- reason                text NULL
- created_at            timestamptz NOT NULL
Indexes:
- (listing_id), (listing_promotion_id), (admin_id)
```

Tariff catalog — DB-backed (ADR-0060, supersedes the static in-code catalog of
ADR-0032). The fixed 6-row matrix (type × period) lives in `promotion_plans` and
is editable by ADMIN via audited endpoints (API.md §15); prices are no longer a
code constant. The activation flow snapshots `promotion_plans.price` into
`listing_promotions.price`, so editing a plan price does NOT change already
active promotions.

```text
promotion_plans   (admin-editable tariff matrix — type × period × price)
- id            uuid PK
- type          promotion_type NOT NULL     (TOP | VIP only)
- period_days   smallint NOT NULL           (7 | 14 | 30)
- price         numeric(14,2) NOT NULL       (Decimal — never float)
- currency      currency NOT NULL default 'UZS'
- is_active     boolean NOT NULL default true
- created_at    timestamptz NOT NULL
- updated_at    timestamptz NOT NULL
Constraints:
- UNIQUE (type, period_days)        -> the matrix is fixed at 6 rows.
- CHECK (period_days IN (7,14,30)).
Seed (UZS):
- TOP  7/14/30  -> 50000 / 90000 / 150000
- VIP  7/14/30  -> 120000 / 210000 / 350000
```

```text
app_settings   (key/value runtime settings)
- key           varchar PK
- value         text NOT NULL
- created_at    timestamptz NOT NULL
- updated_at    timestamptz NOT NULL
Seed:
- promotion_expiry_cron -> '0 */12 * * *'   (interval for the expiry sweep;
    selectable 6h/12h from the admin panel — API.md §15. The env var
    PROMOTION_EXPIRY_CRON remains a fallback default if the row is absent.)
```

Denormalization & priority rules (binding):

```text
1. listing_promotions is the source of truth. listings.promotion_type /
   promotion_started_at / promotion_expires_at are a READ CACHE, updated
   atomically when a promotion is activated / cancelled / extended / expired.
2. Effective tier is TIME-GUARDED in SQL — an EXPIRED promotion is treated as
   NORMAL even if the cache column still says TOP/VIP. Do not depend solely on
   the expire_listing_promotions job for correctness.
3. Only ACTIVE listings are ranked by promotion. Priority: VIP > TOP > NORMAL,
   then newest first, with id as the final tiebreaker.
```

Reference SQL (effective tier + ordering — for the search query):

```sql
-- effective tier (NORMAL if expired or unset)
CASE
  WHEN l.promotion_type <> 'NORMAL' AND l.promotion_expires_at > now()
  THEN l.promotion_type
  ELSE 'NORMAL'
END AS effective_tier

-- deterministic default ordering
ORDER BY
  CASE
    WHEN l.promotion_type = 'VIP' AND l.promotion_expires_at > now() THEN 2
    WHEN l.promotion_type = 'TOP' AND l.promotion_expires_at > now() THEN 1
    ELSE 0
  END DESC,
  l.created_at DESC,
  l.id DESC
```

## 9. Favorites and saved searches

```text
favorites
- id                  uuid PK
- user_id             uuid FK -> users(id) ON DELETE CASCADE
- listing_id          uuid FK -> listings(id) ON DELETE CASCADE
- created_at          timestamptz NOT NULL
Constraints:
- UNIQUE (user_id, listing_id)   (no duplicates)
Indexes:
- (user_id), (listing_id)
Rules:
- GUEST cannot create favorites.
- DELETED listings must not appear in the active favorites list (filtered on read).
```

```text
saved_searches
- id                  uuid PK
- user_id             uuid FK -> users(id) ON DELETE CASCADE
- name                varchar(150) NOT NULL
- filters_json        jsonb NOT NULL        (VERSIONED — see below, ADR-009)
- is_active           boolean NOT NULL default true
- last_checked_at     timestamptz NULL
- created_at          timestamptz NOT NULL
- updated_at          timestamptz NOT NULL
Indexes:
- (user_id), (is_active)
Rules (ADR-009):
- filters_json is versioned: { "schemaVersion": <int>, "filters": { ... } }.
  The matcher tolerates older schemaVersion values (forward migration) so
  saved searches do not silently break as search params evolve.
- MVP: polling matcher (saved_search_queue / check_saved_searches) uses
  last_checked_at to emit de-duplicated alerts for listings that became
  matching since the previous check. Only ACTIVE listings trigger alerts.
- Target: reverse-matching on listing -> ACTIVE (no API change required).
```

## 10. Chat schema

Binding — ADR-003 / ARCHITECTURE §18. Field names are initiator_id / owner_id,
NOT buyer_id / seller_id (listings can be SALE or RENT).

```text
chat_threads
- id                  uuid PK
- listing_id          uuid FK -> listings(id) ON DELETE CASCADE
- initiator_id        uuid FK -> users(id) ON DELETE CASCADE   (started the thread)
- owner_id            uuid FK -> users(id) ON DELETE CASCADE    (listing creator)
- last_message_at     timestamptz NULL
- created_at          timestamptz NOT NULL
- updated_at          timestamptz NOT NULL
Constraints:
- UNIQUE (listing_id, initiator_id, owner_id)   (one thread per pair+listing)
Indexes:
- (listing_id), (initiator_id), (owner_id), (last_message_at)
Rules:
- GUEST cannot start a thread or send messages.
- A new thread is not allowed on a DELETED listing.
```

```text
chat_messages
- id                  uuid PK
- thread_id           uuid FK -> chat_threads(id) ON DELETE CASCADE
- sender_id           uuid FK -> users(id) ON DELETE SET NULL NULL
- body                text NOT NULL
- is_read             boolean NOT NULL default false
- created_at          timestamptz NOT NULL
Indexes:
- (thread_id, created_at)
Note: MVP uses API polling; WebSocket can be added later without schema change.
```

## 11. Notifications schema

```text
notifications
- id                  uuid PK
- user_id             uuid FK -> users(id) ON DELETE CASCADE
- type                notification_type NOT NULL
- channel             notification_channel NOT NULL
- status              notification_status NOT NULL default 'PENDING'
- title               varchar(255) NULL
- body                text NULL
- data_json           jsonb NULL        (entity refs: listing_id, thread_id, etc.)
- read_at             timestamptz NULL
- sent_at             timestamptz NULL
- created_at          timestamptz NOT NULL
Indexes:
- (user_id, created_at), (user_id, status), (type)
Rules:
- MVP delivers EMAIL + IN_APP reliably. All notifications are produced as
  BullMQ jobs — never sent synchronously inside a request handler.
```

```text
notification_devices   (push token registry — stub for MVP, ADR-010)
- id                  uuid PK
- user_id             uuid FK -> users(id) ON DELETE CASCADE
- platform            device_platform NOT NULL   (ANDROID | IOS | WEB)
- push_token          varchar(512) NOT NULL
- is_active           boolean NOT NULL default true
- last_seen_at        timestamptz NULL
- created_at          timestamptz NOT NULL
Constraints:
- UNIQUE (push_token)
Indexes:
- (user_id)
Note: PUSH transport is FCM (Android) / APNs (iOS), fronted by FCM. Wired up
when the Flutter app integrates; table exists so the contract is stable.
```

## 12. Audit schema

Binding — ADR-004 / ARCHITECTURE §24. Generic audit log for security-sensitive
actions, in addition to domain logs (moderation_logs, promotion_logs).

```text
audit_logs
- id                  uuid PK
- actor_id            uuid FK -> users(id) ON DELETE SET NULL NULL  (null = system)
- action              varchar(80) NOT NULL    (free-form, extensible; e.g.
                        LOGIN, ROLE_CHANGE, LISTING_STATUS_CHANGE,
                        LISTING_PROMOTION_CHANGE, DELETE_LISTING, ADMIN_USER_UPDATE)
- entity_type         varchar(60) NULL
- entity_id           uuid NULL
- ip                  varchar(64) NULL
- user_agent          text NULL
- metadata            jsonb NULL
- created_at          timestamptz NOT NULL
Indexes:
- (actor_id), (action), (entity_type, entity_id), (created_at)
Logged actions (minimum): login, role change, listing status change, listing
promotion change, delete listing, admin user update.
```

## 13. Dictionaries

Reference/lookup tables for normalized filters and i18n labels.

```text
cities
- id                  uuid PK
- code                varchar(40) UNIQUE NOT NULL
- name_uz             varchar(150) NOT NULL
- name_ru             varchar(150) NOT NULL
- name_en             varchar(150) NOT NULL
- created_at          timestamptz NOT NULL
```

```text
districts
- id                  uuid PK
- city_id             uuid FK -> cities(id) ON DELETE CASCADE
- code                varchar(60) NOT NULL
- name_uz             varchar(150) NOT NULL
- name_ru             varchar(150) NOT NULL
- name_en             varchar(150) NOT NULL
- created_at          timestamptz NOT NULL
Constraints:
- UNIQUE (city_id, code)
Indexes:
- (city_id)
```

```text
features   (amenities dictionary referenced by listing_features)
- id                  uuid PK
- code                varchar(60) UNIQUE NOT NULL
- name_uz             varchar(150) NOT NULL
- name_ru             varchar(150) NOT NULL
- name_en             varchar(150) NOT NULL
- created_at          timestamptz NOT NULL
```

Note: `roles` is also a seeded dictionary but is documented under §4 (identity).

## 14. Prisma notes

Binding conventions for the Prisma schema (ADR-001/002).

```text
- snake_case mapping: every model uses @@map("table_name") and every column
  uses @map("column_name"). Models are PascalCase, fields camelCase.
- IDs: id String @id @default(uuid()) @db.Uuid
- Timestamps: createdAt DateTime @default(now()) @map("created_at");
              updatedAt DateTime @updatedAt @map("updated_at")
- Money/measures: Decimal @db.Decimal(14,2) (price) / @db.Decimal(10,2) (area).
- lat/lng: Decimal @db.Decimal(9,6).
- Enums: declared as Prisma enum; values mirror §3 exactly.
```

PostGIS handling (ADR-001):

```prisma
model Listing {
  id        String   @id @default(uuid()) @db.Uuid
  latitude  Decimal? @db.Decimal(9, 6)
  longitude Decimal? @db.Decimal(9, 6)
  // Prisma has no native PostGIS type:
  location  Unsupported("geography(Point, 4326)")?
  price     Decimal  @db.Decimal(14, 2)
  // ...
  @@map("listings")
}
```

```text
1. `location` is modelled as Unsupported("geography(Point, 4326)") — Prisma
   cannot read/write it through the query builder.
2. latitude/longitude are the editable source columns. `location` is derived
   and kept in sync on every write, in the SAME transaction:
     UPDATE listings
        SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
      WHERE id = $1;
   (Recommended: a BEFORE INSERT/UPDATE trigger so it cannot drift; the trigger
   itself is created via a raw SQL migration.)
3. The GIST index on `location` is created via a RAW SQL migration — Prisma
   migrate does not emit it automatically:
     CREATE INDEX idx_listings_location ON listings USING GIST (location);
4. All geo queries run through prisma.$queryRaw, e.g.:
     - radius:  ST_DWithin(location, ST_MakePoint($lng,$lat)::geography, $meters)
     - bounds:  ST_Within(location::geometry,
                          ST_MakeEnvelope($w,$s,$e,$n,4326))
     - near-me: ORDER BY location <-> ST_MakePoint($lng,$lat)::geography
   Promotion ordering and ACTIVE filtering are applied in the same raw query.
5. The PostGIS extension is enabled via migration:
     CREATE EXTENSION IF NOT EXISTS postgis;
   (already present in apps/api/prisma/schema.prisma init).
```

Partial unique indexes (ADR-013):

```text
Prisma cannot express filtered/partial unique indexes. The uniqueness of
users.phone / users.email AMONG NON-DELETED accounts is created via a raw SQL
migration; phone/email are NOT marked @unique in the Prisma model:
  CREATE UNIQUE INDEX uniq_users_phone_active
    ON users (phone) WHERE status <> 'DELETED' AND phone IS NOT NULL;
  CREATE UNIQUE INDEX uniq_users_email_active
    ON users (email) WHERE status <> 'DELETED' AND email IS NOT NULL;
This lets a soft-deleted account free its contact for re-registration while
keeping the original value on the deleted row.
```

## 15. Required business constraints

```text
Uniqueness
- users.phone PARTIAL UNIQUE WHERE status <> 'DELETED' AND phone IS NOT NULL
- users.email PARTIAL UNIQUE WHERE status <> 'DELETED' AND email IS NOT NULL
    -> contact is unique among non-deleted accounts only; freed on soft-delete
       so it can be reused for re-registration (ADR-013, raw SQL — see §14).
- user_roles (user_id, role_id) UNIQUE
- agency_members (agency_id, user_id) UNIQUE
- agencies.slug UNIQUE
- listing_translations (listing_id, language) UNIQUE
- listing_features (listing_id, feature_id) UNIQUE
- favorites (user_id, listing_id) UNIQUE
- chat_threads (listing_id, initiator_id, owner_id) UNIQUE
- listing_promotions (listing_id) PARTIAL UNIQUE WHERE status='ACTIVE'
- listing_promotions (payment_reference) PARTIAL UNIQUE WHERE NOT NULL
- notification_devices (push_token) UNIQUE

Check constraints
- users: phone IS NOT NULL OR email IS NOT NULL
- users: (status = 'DELETED') = (deleted_at IS NOT NULL)   (deleted_at set iff DELETED)
- listings: price >= 0; area IS NULL OR area >= 0
- listing_promotions: period_days IN (7,14,30)
- listing_promotions: expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at

Behavioural rules enforced by the data layer
- Public search returns ONLY status = ACTIVE listings; DELETED and other
  non-public statuses are always excluded on read paths.
- Effective promotion tier is time-guarded in SQL: an EXPIRED promotion is
  treated as NORMAL regardless of the cached promotion_type (ADR-006).
- At most one ACTIVE promotion per listing (partial unique index).
- listing_promotions is the source of truth; listings.promotion_* is a cache
  updated atomically on activate/cancel/extend/expire.
- Auto translations inherit the parent listing's visibility/status and are
  never independently publishable (ADR-005).
- listing_media is EXIF/GPS-stripped on processing; coordinates come only from
  the map picker (ADR-008).
- saved_searches.filters_json is versioned (schemaVersion) (ADR-009).
- OTP codes and refresh tokens are stored HASHED; refresh tokens rotate on use.
- Promotion activation / payment callbacks are idempotent via
  payment_reference / an idempotency key (no double activation or double charge).
- Security-sensitive actions are written to audit_logs (ADR-004).
- GUEST is never persisted (ADR-011).
- A user account is soft-deleted (ACTIVE -> DELETED, deleted_at set); the row is
  retained for referential history. phone/email uniqueness applies only among
  non-DELETED accounts, so the same contact can register a NEW account (new id)
  without conflict, while the original value is kept on the deleted row
  (Variant A — ADR-013).
```

## 16. MVP table checklist

```text
[x] users
[x] user_profiles
[x] roles
[x] user_roles
[x] otp_codes
[x] refresh_tokens
[x] agencies
[x] agency_members
[x] listings
[x] listing_translations
[x] listing_media
[x] listing_features
[x] listing_promotions
[x] promotion_logs
[x] moderation_logs
[x] complaints
[x] favorites
[x] saved_searches
[x] chat_threads
[x] chat_messages
[x] notifications
[x] notification_devices   (push token registry; transport wired with mobile)
[x] audit_logs
[x] cities
[x] districts
[x] features
```

## 17. Out of scope for MVP

```text
- Online payment transactions table / payment ledger (PaymentsModule is
  architecturally prepared; promotion is manually activated by admin —
  payment_status = NOT_REQUIRED). Online payment is added only after a
  provider is confirmed (Phase 1.5).
- Agency subscriptions / billing plans.
- Tenant screening data.
- Mortgage calculator / property valuation models.
- Video media (listing_media.type = VIDEO is Phase 2).
- Trusted-agency auto-publish (bypassing moderation).
- AI/LLM translation-quality storage (auto translations stay provider-based).
- Custom drawn-polygon search geometry storage (Phase 2 if needed).
```
