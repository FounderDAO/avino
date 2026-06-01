# ARCHITECTURE.md — Avino

## 1. Project overview

Avino — портал недвижимости для Узбекистана.

Платформа включает:

- web app;
- backend API;
- admin/moderation panel;
- mobile API для Flutter app;
- единую базу объявлений;
- внутренний чат;
- уведомления;
- геопоиск;
- автоперевод объявлений на 3 языка;
- VIP/TOP продвижение объявлений.

Основной домен:

```text
www.avino.uz
```

Support email:

```text
Support@avino.uz
```

## 2. Main stack

```text
Backend: NestJS / Node.js
Frontend: Next.js / TypeScript
Database: PostgreSQL + PostGIS
ORM: Prisma
Cache / Queue: Redis + BullMQ
Storage: S3-compatible storage
Maps: Yandex Maps
SMS: Eskiz.uz
Email: SMTP provider
Translation: Google Translate API or Yandex Translate API
Mobile App: Flutter, separate team
```

## 3. Repository structure

```text
avino/
├── apps/
│   ├── api/                  # NestJS backend
│   ├── web/                  # Next.js web frontend
│   └── admin/                # Optional separate admin panel
│
├── packages/
│   ├── shared/               # Shared types, enums, constants
│   ├── config/               # Shared config
│   └── validators/           # Shared validation schemas if needed
│
├── docs/
│   ├── PRD.md
│   ├── ROADMAP.md
│   ├── CLAUDE.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DB_SCHEMA.md
│   ├── TASKS.md
│   ├── ENV.md
│   ├── SECURITY.md
│   └── MOBILE_API_GUIDE.md
│
├── docker-compose.yml
├── .env.example
├── README.md
└── package.json
```

## 4. Backend architecture

Backend is built with NestJS.

Main backend modules:

```text
AuthModule
UsersModule
RolesModule
ProfilesModule
ListingsModule
ListingMediaModule
ListingModerationModule
ListingPromotionModule
SearchModule
GeoModule
FavoritesModule
SavedSearchesModule
NotificationsModule
ChatModule
TranslationModule
AgenciesModule
AgentsModule
LandlordsModule
AdminModule
UploadsModule
EmailModule
SmsModule
PaymentsModule
HealthModule
```

Important MVP rule:

```text
PaymentsModule can be prepared architecturally, but online payment integration is not required for MVP unless payment provider is confirmed.
```

## 5. API versioning

API versioning is mandatory from day one.

All backend routes must use:

```text
/api/v1/<resource>
```

Examples:

```text
POST /api/v1/auth/login
GET /api/v1/listings
POST /api/v1/listings
GET /api/v1/listings/:id
GET /api/v1/search
GET /api/v1/chat/threads
GET /api/v1/promotions/plans
POST /api/v1/admin/listings/:id/promotions
```

MVP implements only:

```text
v1
```

Do not create `v2` until there is a real breaking change.

Unversioned API routes are forbidden.

NestJS setup:

```ts
app.setGlobalPrefix('api');

app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
```

Every controller must explicitly define version:

```ts
@Controller({
  path: 'listings',
  version: '1',
})
export class ListingsController {}
```

## 6. Authentication

Avino supports two authentication methods:

```text
SMS login
Email login
```

SMS provider:

```text
Eskiz.uz
```

Auth flow:

```text
User enters phone/email
System sends OTP
User confirms OTP
Backend creates or updates user
Backend returns access token and refresh token
```

Auth tokens:

```text
Access token: short-lived
Refresh token: long-lived
```

Required auth features:

- OTP request;
- OTP verification;
- refresh token;
- logout;
- profile completion;
- role assignment;
- admin role management.

## 7. Roles

Main user roles:

```text
guest
user
owner
agent
agency
landlord
property_manager
moderator
admin
```

Role meaning:

```text
guest               Can search and view listings
user                Can save listings, create saved searches, chat, send requests
owner               Can create and manage own listings
agent               Can create and manage listings professionally
agency              Can manage agency profile and agency listings
landlord            Can publish rental listings
property_manager    Can manage rental listings
moderator           Can review listings and complaints
admin               Full system management
```

Role model rules:

```text
A user may hold multiple roles (many-to-many via user_roles).
guest is NOT stored in user_roles — it is the implicit state of an
  unauthenticated request (no token). Do not persist a guest role row.
agency as a ROLE means "agency administrator" (manages the agency
  profile and the agency members/listings). It is distinct from the
  `agencies` ENTITY (the organization itself) and `agency_members`
  (the membership join). A user is linked to an agency via agency_members
  and additionally carries the agent and/or agency role.
Authorization is enforced by an RBAC guard backed by a documented
  permission matrix (role -> allowed actions), not by ad-hoc checks.
```

## 8. Listings

Listing is the core entity of Avino.

A listing can be:

```text
sale
rent
```

Property types:

```text
apartment
house
new_building
land
commercial
```

Main listing data:

```text
id
ownerId
agencyId
transactionType
propertyType
status
promotionType
promotionStartedAt
promotionExpiresAt
price
currency
area
rooms
floor
totalFloors
yearBuilt
address
city
district
latitude
longitude
location
features
createdAt
updatedAt
publishedAt
```

Field data-type rules (binding):

```text
price            Decimal (Prisma Decimal / Postgres numeric) — NEVER float.
area             Decimal — NEVER float.
currency         enum / fixed string code (e.g. UZS, USD). Stored per listing.
latitude         Decimal
longitude        Decimal
location         PostGIS geography(Point, 4326). Source of truth for geo
                   queries; derived from latitude/longitude and kept in sync
                   on every write (see §22 PostGIS + Prisma integration).
status           enum (see §9)
transactionType  enum: sale | rent
propertyType     enum (see property types above)
promotionType    enum: NORMAL | TOP | VIP (effective value is time-guarded,
                   see §10).
```

Currency rule:

```text
Each listing stores its own currency. Price-range filtering is applied
within a single selected currency. Cross-currency conversion (FX) is
OUT OF SCOPE for MVP — the API does not convert prices between currencies.
```

## 9. Listing statuses

Backend should support:

```text
NEW
ACTIVE
DRAFT
REJECTED
DELETED
ARCHIVED
SOLD
RENTED
```

MVP UI may show only:

```text
NEW
ACTIVE
DRAFT
DELETED
```

Moderation flow:

```text
User creates listing
Listing status becomes NEW
Moderator/admin reviews listing
Moderator/admin changes status to ACTIVE / DRAFT / REJECTED / DELETED
```

All listings must go through moderation queue.

Auto-publish for trusted agencies is not part of MVP.

## 10. Paid promotion architecture

Avino must support paid listing promotion from the architecture level.

Promotion types:

```text
NORMAL
TOP
VIP
```

Promotion priority:

```text
VIP > TOP > NORMAL
```

Promotion periods:

```text
7 days
14 days
30 days
```

Recommended listing promotion fields on `listings` table:

```text
promotionType
promotionStartedAt
promotionExpiresAt
```

Recommended separate table:

```text
listing_promotions
```

Listing promotion fields:

```text
id
listingId
userId
type
status
periodDays
startsAt
expiresAt
price
currency
paymentStatus
paymentProvider
paymentReference
createdAt
updatedAt
```

Promotion statuses:

```text
PENDING_PAYMENT
ACTIVE
EXPIRED
CANCELLED
REFUNDED
```

Payment statuses:

```text
NOT_REQUIRED
PENDING
PAID
FAILED
REFUNDED
```

MVP recommendation:

```text
VIP/TOP promotion logic must exist.
Admin can manually activate VIP/TOP for 7/14/30 days.
Online payment integration can be Phase 1.5 after provider confirmation.
```

Search and listing sorting rule:

```text
1. ACTIVE listings with active VIP promotion
2. ACTIVE listings with active TOP promotion
3. ACTIVE listings with NORMAL promotion
```

Inside each group, default sorting:

```text
newest first
```

If promotion expires, listing automatically returns to NORMAL priority.

Promotion integrity rules (binding):

```text
1. At most ONE active promotion per listing at a time. Activating a new
   promotion supersedes the previous one (the old row is closed, the new
   row becomes the active source of truth). Stacking/overlap is not allowed.
2. listing_promotions is the source of truth (ledger). The denormalized
   columns on listings (promotionType / promotionStartedAt /
   promotionExpiresAt) are a read cache used for fast sorting. They MUST be
   updated atomically when a promotion is activated, cancelled, extended,
   or expired.
3. The effective tier is TIME-GUARDED. A listing counts as VIP/TOP only
   while promotionExpiresAt > now(). Search and listing queries MUST apply
   this time guard in the SQL itself (e.g. CASE WHEN promotionExpiresAt >
   now() THEN promotionType ELSE 'NORMAL'). Do not rely solely on the
   expire job — the job is for cache cleanup and notifications, not for
   correctness of the ordering.
4. Promotion is independent of moderation: only ACTIVE listings are ranked
   by promotion tier. A promoted listing that is not ACTIVE is not shown.
```

Promotion expiration must be handled by background job.

Required queue:

```text
promotion_queue
```

Required job:

```text
expire_listing_promotions
```

Required admin actions:

```text
activate_vip
activate_top
cancel_promotion
extend_promotion
```

Required API examples:

```text
GET /api/v1/promotions/plans
GET /api/v1/admin/listings/:id/promotions
POST /api/v1/admin/listings/:id/promotions
PATCH /api/v1/admin/listing-promotions/:id/cancel
PATCH /api/v1/admin/listing-promotions/:id/extend
```

Online payment is not required in MVP unless payment provider is confirmed.

## 11. Multi-language support

Avino supports 3 languages:

```text
uz
ru
en
```

Default language is detected from:

```text
browser language
mobile device language
```

User can manually switch language.

Listing text fields must support translations.

Translatable fields:

```text
title
description
addressNote
featuresText
```

User creates listing in one language.

System automatically translates text to other languages using:

```text
Google Translate API
or
Yandex Translate API
```

Translation quality upgrade through AI/LLM can be added later.

Recommended translation storage:

```text
Listing
ListingTranslation
```

Example:

```text
Listing
- id
- status
- price
- location
- createdById

ListingTranslation
- id
- listingId
- language
- title
- description
- addressNote
- source
- isAutoTranslated
```

Translation flow rules (binding):

```text
1. Auto-translation runs AFTER a listing is approved (status -> ACTIVE),
   not on creation. This avoids spending Translate API quota on listings
   that get REJECTED, and avoids publishing machine text that bypassed
   moderation.
2. The original (author) language version always exists with
   isAutoTranslated = false and source = 'user'.
3. Generated translations carry isAutoTranslated = true and inherit the
   moderation status of the parent listing — they are never independently
   publishable.
4. If the listing text is edited after approval, affected translations are
   regenerated (re-enqueue translate_listing) and the listing may re-enter
   moderation per moderation policy.
5. Translation is performed by the translation_queue worker (BullMQ); the
   create/approve request must not block on the translation provider.
```

## 12. Search architecture

Search must support:

```text
city
district
address
transaction type
property type
price range
currency
area range
rooms
floor
total floors
year built
features
promotion type
map bounds
radius search
near me search
sorting
pagination
```

Sorting:

```text
promotion_priority_desc
price_asc
price_desc
date_desc
area_asc
area_desc
```

Default search sorting:

```text
VIP first
TOP second
NORMAL third
newest first inside each group
```

Sort determinism (binding):

```text
Pagination requires a stable, total ordering. The effective sort key is:
  (effective_promotion_tier DESC, createdAt DESC, id DESC)
where effective_promotion_tier is time-guarded (VIP/TOP only while
promotionExpiresAt > now(), otherwise NORMAL). The trailing id keeps the
order deterministic when createdAt collides. Keyset/seek pagination is
preferred over OFFSET for deep result sets.
```

Text search rules (binding):

```text
Free-text search over title / description / addressNote targets the
listing_translations row matching the user's current language. Listings
without a translation in that language fall back to the original language
version. For MVP, text matching uses Postgres ILIKE / pg_trgm; a dedicated
full-text (tsvector) or external search engine can be introduced later
without breaking the API.
```

Currency in search:

```text
Price-range filters apply within the currency the user selects. No FX
conversion is performed (see §8 currency rule).
```

For geo search use:

```text
PostgreSQL + PostGIS
```

Required geo features:

```text
search by coordinates
search by radius
search by map bounds
near me search
listing markers
marker clustering support
```

## 13. Maps

Maps provider:

```text
Yandex Maps
```

Web and mobile must support:

```text
display listing markers
display listing preview on marker click
select listing location during creation
search by visible map area
search by radius
near me search
marker clustering
```

Search by custom drawn polygon can be added later if needed.

## 14. Media and uploads

Photos and files must be stored in S3-compatible storage.

Do not store listing photos inside the application server filesystem.

Required media flow:

```text
User uploads image
Backend validates file type and size
Backend uploads to S3
Backend saves media record in database
Listing uses media URLs
```

Listing media fields:

```text
id
listingId
url
thumbnailUrl
sortOrder
type
createdAt
```

Allowed media types for MVP:

```text
image/jpeg
image/png
image/webp
```

Video can be Phase 2.

Media processing rules (binding):

```text
1. EXIF metadata MUST be stripped from every uploaded image during
   processing — in particular GPS coordinates — for privacy and security.
   The listing location comes only from the map-picked coordinates, never
   from photo EXIF.
2. Validation on upload: MIME type allow-list (jpeg/png/webp), max file
   size, max files per listing, and basic image-dimension sanity checks.
3. The media_processing_queue worker (process_uploaded_image) generates the
   thumbnail (thumbnailUrl) and a normalized/web-optimized variant.
4. Upload transport: MVP may proxy uploads through the API (validate ->
   upload to S3). The target architecture is direct-to-S3 via short-lived
   presigned PUT URLs with server-side post-validation, to keep large file
   bandwidth off the API process. The DB media record is the source of
   truth; orphaned S3 objects are reaped by a cleanup job.
```

## 15. Favorites

Authenticated users can save listings to favorites.

Favorite entity:

```text
id
userId
listingId
createdAt
```

Rules:

```text
guest cannot save favorites
user cannot duplicate same listing in favorites
deleted listings should not appear in active favorites list
```

## 16. Saved searches

Authenticated users can save search filters.

Saved search should store:

```text
id
userId
name
filtersJson
isActive
lastCheckedAt
createdAt
updatedAt
```

When a new matching listing appears, system sends notification.

Notification channels:

```text
email
push
in-app
```

MVP required:

```text
email notification for new matching listing
```

Matching strategy (binding):

```text
1. filtersJson stores a VERSIONED filter payload: { schemaVersion, filters }.
   The matcher must tolerate older schemaVersion values (forward migration)
   so saved searches do not silently break when search params evolve.
2. MVP uses a polling matcher: the saved_search_queue worker
   (check_saved_searches) periodically re-runs active saved searches and
   uses lastCheckedAt to emit alerts only for listings that became matching
   since the previous check (de-duplicated to avoid repeat emails).
3. Target architecture is reverse-matching: when a listing becomes ACTIVE,
   it is evaluated against stored saved searches. This scales better and
   can replace polling without an API change.
4. Only ACTIVE listings trigger saved-search alerts.
```

## 17. Notifications

Notification types:

```text
saved_search_new_listing
favorite_price_drop
new_chat_message
listing_moderation_status_changed
new_lead
promotion_activated
promotion_expired
```

Notification channels:

```text
email
push
in_app
```

Queue processing:

```text
Redis + BullMQ
```

Notification jobs:

```text
send_email
send_push
check_saved_searches
notify_chat_message
notify_listing_status
notify_promotion_status
```

Channel / transport rules (binding):

```text
MVP delivers email + in_app reliably. "push" is the mobile transport
(FCM for Android, APNs for iOS, fronted by FCM). Push requires a device-token
registry (per user, per device) and a provider credential — these are a
documented stub for MVP and are wired up when the Flutter app integrates.
All notifications are produced as queue jobs (BullMQ); no notification is
sent synchronously inside a request handler.
Notification delivery attempts are recorded (notification logs, see §19)
for admin visibility.
```

## 18. Internal chat

MVP includes full internal chat.

Users can message listing creators:

```text
owner
agent
agency
landlord
property_manager
```

Chat must be connected to a listing.

Main chat entities:

```text
ChatThread
ChatMessage
```

ChatThread:

```text
id
listingId
initiatorId        # user who started the thread (buyer / renter / inquirer)
ownerId            # listing creator (owner / agent / agency / landlord / PM)
lastMessageAt
createdAt
updatedAt
```

Naming note (binding):

```text
Fields are named initiatorId / ownerId, NOT buyerId / sellerId, because
listings can be sale OR rent — "buyer/seller" wrongly assumes a sale.
This neutral naming is fixed now to avoid a breaking API change (which
would force a v2) once clients are built.
A thread is unique per (listingId, initiatorId, ownerId).
```

ChatMessage:

```text
id
threadId
senderId
body
isRead
createdAt
```

MVP can use regular API polling.

WebSocket can be added when needed.

Chat rules:

```text
guest cannot send messages
user cannot create duplicate thread for same listing and owner
deleted listing should not allow new chat thread
moderator/admin can access chat only if needed for complaint/support flow
```

## 19. Admin and moderation

Admin panel must support:

```text
user management
role management
listing moderation
listing status updates
manual VIP/TOP promotion management
agency management
dictionary management
complaints management
notification logs
basic analytics
```

Moderation queue:

```text
GET /api/v1/admin/listings?status=NEW
PATCH /api/v1/admin/listings/:id/status
```

Moderator actions:

```text
approve
send_to_draft
reject
delete
```

Every moderation action must be logged.

Moderation log:

```text
id
listingId
moderatorId
oldStatus
newStatus
reason
createdAt
```

Promotion admin actions must also be logged.

Promotion log:

```text
id
listingPromotionId
listingId
adminId
action
oldType
newType
oldExpiresAt
newExpiresAt
reason
createdAt
```

## 20. Frontend architecture

Frontend is built with Next.js and TypeScript.

Frontend API access must use RTK Query.

No random `fetch()` or `axios` inside components.

Recommended structure:

```text
apps/web/src/app/
apps/web/src/features/
apps/web/src/components/
apps/web/src/store/
apps/web/src/store/api/
apps/web/src/store/slices/
apps/web/src/lib/
apps/web/src/i18n/
```

RTK Query files:

```text
apps/web/src/store/api/baseApi.ts
apps/web/src/store/api/authApi.ts
apps/web/src/store/api/listingsApi.ts
apps/web/src/store/api/searchApi.ts
apps/web/src/store/api/favoritesApi.ts
apps/web/src/store/api/savedSearchesApi.ts
apps/web/src/store/api/chatApi.ts
apps/web/src/store/api/notificationsApi.ts
apps/web/src/store/api/promotionsApi.ts
apps/web/src/store/api/adminApi.ts
```

## 21. Mobile API compatibility

Mobile app is developed separately in Flutter.

Backend must provide stable API for:

```text
auth
profile
listings
search
map
favorites
saved searches
chat
notifications
uploads
promotions
```

Mobile API must be documented in:

```text
docs/MOBILE_API_GUIDE.md
```

Mobile clients must use only versioned API routes:

```text
/api/v1/...
```

## 22. Database architecture

Database:

```text
PostgreSQL + PostGIS
```

Core tables:

```text
users
user_profiles
roles
user_roles
agencies
agency_members
listings
listing_translations
listing_media
listing_features
listing_promotions
promotion_logs
favorites
saved_searches
notifications
chat_threads
chat_messages
moderation_logs
complaints
audit_logs
otp_codes
refresh_tokens
```

audit_logs is a generic security audit table (see §24). Suggested fields:

```text
id
actorId            # nullable for system/anonymous events
action             # e.g. login, role_change, listing_status_change, delete_listing
entityType
entityId
ip
userAgent
metadata           # jsonb
createdAt
```

PostGIS + Prisma integration (binding):

```text
Prisma has no native PostGIS type. To use PostGIS without leaving Prisma:
1. Model `location` as Unsupported("geography(Point, 4326)") in schema.prisma.
2. latitude / longitude are first-class Decimal columns (the editable source).
3. `location` is derived from latitude/longitude and kept in sync on write —
   via a DB trigger or an explicit ST_SetSRID(ST_MakePoint(lng,lat),4326)
   update in the same transaction.
4. The GIST index on `location` is created via a raw SQL migration (Prisma
   migrate does not emit it automatically).
5. Geo queries (ST_DWithin for radius, ST_MakeEnvelope/ST_Within for map
   bounds, nearest for near-me) are executed with prisma.$queryRaw, not the
   Prisma query builder.
```

Geo fields:

```text
latitude
longitude
location geography(Point, 4326)
```

Geo indexes:

```text
GIST index on location
```

Required indexes:

```text
listings.status
listings.propertyType
listings.transactionType
listings.price
listings.city
listings.district
listings.location
listings.promotionType
listings.promotionExpiresAt
listing_promotions.listingId
listing_promotions.status
listing_promotions.expiresAt
favorites.userId
saved_searches.userId
chat_threads.listingId
chat_threads.initiatorId
chat_threads.ownerId
chat_messages.threadId
```

Required unique constraints (data integrity):

```text
favorites (userId, listingId)              -- no duplicate favorites
chat_threads (listingId, initiatorId, ownerId)  -- one thread per pair+listing
user_roles (userId, roleId)
agency_members (agencyId, userId)
```

Soft-delete note:

```text
DELETED is a soft-delete status, not a row removal. All read paths
(search, favorites, chat creation) must exclude DELETED / non-public
statuses explicitly.
```

## 23. Background jobs

Use Redis + BullMQ.

Required queues:

```text
translation_queue
email_queue
notification_queue
saved_search_queue
media_processing_queue
promotion_queue
```

Jobs:

```text
translate_listing
send_email
send_saved_search_alert
send_chat_notification
process_uploaded_image
expire_listing_promotions
```

## 24. Security

Required security rules:

```text
JWT auth
refresh token rotation
role-based access control
input validation
rate limiting
OTP rate limiting
file upload validation
admin audit logs
CORS configuration
environment secrets outside git
```

Sensitive actions must be logged:

```text
login
role change
listing status change
listing promotion change
delete listing
admin user update
```

Audit & integrity rules (binding):

```text
1. All sensitive actions above are persisted to the audit_logs table
   (see §22), in addition to any domain-specific log (moderation_logs,
   promotion_logs).
2. Refresh tokens are stored hashed (never in plaintext) and rotated on
   use; reuse of a rotated token revokes the session family.
3. OTP codes are stored hashed with expiry and attempt limits; OTP request
   and verification are rate-limited (per phone/email and per IP).
4. Any future write that may be retried by a client or a payment provider
   (promotion activation, payment callbacks) MUST be idempotent via an
   idempotency key / unique paymentReference, to prevent double activation
   or double charge.
5. Uploaded images have EXIF (incl. GPS) stripped (see §14).
```

## 25. Environment variables

Required env groups:

```text
APP
DATABASE
REDIS
JWT
S3
ESKIZ
EMAIL
TRANSLATION
YANDEX_MAPS
CORS
PAYMENTS
```

Example:

```text
DATABASE_URL=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
ESKIZ_EMAIL=
ESKIZ_PASSWORD=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
TRANSLATION_PROVIDER=
YANDEX_MAPS_API_KEY=
PAYMENT_PROVIDER=
```

## 26. MVP boundaries

MVP includes:

```text
web app
backend API
admin/moderation
auth by SMS/email
listings
listing moderation
search and filters
Yandex Maps
PostGIS geo search
favorites
saved searches
email alerts
internal chat
3 languages
auto translation
S3 uploads
mobile-compatible API
VIP/TOP promotion architecture
manual admin activation of VIP/TOP
promotion expiration jobs
```

MVP does not include:

```text
online payment integration
agency subscriptions
tenant screening
mortgage calculator
property valuation
video uploads
trusted agency auto-publish
AI-quality translation upgrade
```

## 27. Development rules for Claude

Claude must follow:

```text
CLAUDE.md
PRD.md
ROADMAP.md
ARCHITECTURE.md
API.md
DB_SCHEMA.md
TASKS.md
```

Claude must not:

```text
push directly to main
create unversioned API routes
remove RTK Query
remove PostGIS
replace Yandex Maps
replace Eskiz.uz
add online payments without confirmation
add tenant screening to MVP
make large unrelated PRs
```

Every logical improvement must be:

```text
separate branch
1–3 commits
Pull Request
pre-merge checklist
```

## 28. Resolved architecture decisions (ADR log)

The decisions below resolve open gaps in the architecture. They are
documentation-level decisions (no code) and are recorded here so they are
binding before implementation starts. Each must be approved by the Team Lead
at PR review.

```text
ADR-001  PostGIS via Prisma
         Decision: location = Unsupported geography(Point,4326); lat/lng are
         Decimal source columns; location synced on write; GIST index via raw
         SQL migration; geo queries via $queryRaw. (§22)
         Why: Prisma has no native PostGIS support — needed before GeoModule.

ADR-002  Money & numeric types
         Decision: price/area as Decimal (numeric), never float; currency
         stored per listing; no FX conversion in MVP. (§8)
         Why: financial precision; matches stack convention.

ADR-003  Chat party naming
         Decision: ChatThread fields are initiatorId / ownerId, not
         buyerId / sellerId. (§18, §22)
         Why: listings are sale OR rent; renaming later = breaking change → v2.

ADR-004  Generic audit_logs table
         Decision: add audit_logs for all sensitive actions, beside
         moderation_logs / promotion_logs. (§22, §24)
         Why: Security requires logging login/role/delete with no home table.

ADR-005  Translation ordering
         Decision: auto-translate AFTER ACTIVE; translations inherit listing
         status; never independently publishable; async via queue. (§11)
         Why: save Translate quota; do not bypass moderation.

ADR-006  Promotion integrity
         Decision: one active promotion per listing; listing_promotions is the
         ledger, listing columns are a synced cache; effective tier is
         time-guarded in SQL; only ACTIVE listings are ranked. (§10)
         Why: prevent denormalization drift and stale top placement.

ADR-007  Deterministic sort & pagination
         Decision: sort key (effective_tier DESC, createdAt DESC, id DESC);
         prefer keyset pagination. (§12)
         Why: stable ordering under promotion + pagination.

ADR-008  Media privacy & transport
         Decision: strip EXIF/GPS on processing; validate MIME/size/count;
         target direct-to-S3 presigned uploads (proxy allowed for MVP). (§14)
         Why: privacy/security and bandwidth off the API process.

ADR-009  Saved-search matching
         Decision: versioned filtersJson; MVP polling matcher with
         lastCheckedAt + de-dup; reverse-matching as the scale target;
         ACTIVE-only triggers. (§16)
         Why: avoid broken/duplicate alerts; clear scaling path.

ADR-010  Notification transport
         Decision: email + in_app for MVP; push = FCM/APNs with a device-token
         registry as a documented stub; all sends are queue jobs. (§17)
         Why: push provider was unspecified; keep API client-neutral.

ADR-011  Roles model clarity
         Decision: multi-role via user_roles; guest is implicit (no row);
         "agency" role = agency admin, distinct from agencies entity /
         agency_members; RBAC guard backed by a permission matrix. (§7)
         Why: remove ambiguity between role and organization.

ADR-012  Text search
         Decision: free-text targets listing_translations for the user's
         language with fallback to original; MVP uses ILIKE/pg_trgm; FTS or
         search engine can be added without API change. (§12)
         Why: multilingual listings need language-aware search.

ADR-013  User account soft-delete & contact reuse
         Decision: users.status is an enum (ACTIVE | BLOCKED | DELETED) with a
         deleted_at column; ACTIVE -> DELETED is a soft-delete (row retained so
         listings/chat/logs keep referential history). phone/email uniqueness is
         enforced by PARTIAL UNIQUE indexes scoped to non-deleted accounts
         (status <> 'DELETED'), created via raw SQL migration — so a soft-deleted
         account does NOT block re-registration with the same phone/email, while
         the original contact value is preserved on the deleted row. BLOCKED is
         not DELETED and still reserves its contact. (DB_SCHEMA §3/§4/§14/§15)
         Why: let users delete and later re-register without UNIQUE conflicts,
         without mutating the stored contact value (Variant A — keep value).
```


