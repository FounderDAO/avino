# PRD.md — Avino

## 1. Product overview

Avino — портал недвижимости для Узбекистана.

Цель продукта — создать удобную платформу, где пользователи могут искать недвижимость для покупки или аренды, а собственники, агенты, агентства, арендодатели и property managers могут публиковать и управлять своими объявлениями.

Avino включает:

- web platform;
- backend API;
- admin/moderation panel;
- mobile-compatible API для Flutter-приложения;
- внутренний чат;
- поиск по карте;
- сохранённые поиски;
- уведомления;
- автоперевод объявлений;
- VIP/TOP продвижение объявлений.

Основной домен:

text www.avino.uz 

Support email:

text Support@avino.uz 

## 2. Product goals

Основные цели Avino:

text 1. Создать национальный портал недвижимости для Узбекистана. 2. Дать пользователям быстрый поиск жилья по фильтрам и карте. 3. Дать собственникам и агентам удобный кабинет для публикации объявлений. 4. Обеспечить качество объявлений через обязательную модерацию. 5. Поддержать 3 языка: Uzbek, Russian, English. 6. Автоматически переводить объявления на другие языки. 7. Реализовать внутренний чат между пользователем и создателем объявления. 8. Заложить монетизацию через VIP/TOP продвижение. 9. Подготовить стабильный API для будущего Flutter mobile app. 

## 3. Product scope

## 3.1 In scope for MVP

MVP включает:

text Web app Backend API Admin/moderation panel Authentication by SMS and email Eskiz.uz SMS integration User roles and profiles Listings CRUD Listing moderation Listing translations Auto translation via Google/Yandex Translate API Search and filters PostGIS geo search Yandex Maps integration Favorites Saved searches Email alerts In-app notifications Internal chat S3-compatible image uploads VIP/TOP promotion architecture Manual admin activation of VIP/TOP promotions Promotion expiration background job Mobile-compatible API API versioning /api/v1 

## 3.2 Out of scope for MVP

MVP не включает:

text Online payment integration Agency subscriptions Tenant screening Mortgage calculator Property valuation Video uploads Trusted agency auto-publish AI/LLM translation upgrade Custom polygon search Mobile app implementation 

Important:

text Mobile app will be developed separately by another developer. Backend must remain compatible with Flutter mobile client. 

## 4. Target users

## 4.1 Guest

Unauthenticated visitor.

Can:

text View public listings Use search and filters View map Open listing detail page See public agent/owner contact options where allowed 

Cannot:

text Create listing Save favorites Save searches Use chat Receive notifications 

## 4.2 User

Authenticated user looking for property.

Can:

text Search listings Save favorites Create saved searches Receive email alerts Start chat with listing creator View chat history View notification history Manage profile 

## 4.3 Owner

Property owner.

Can:

text Create own listings Edit own listings Upload photos Submit listings for moderation Manage listing status where allowed Receive leads/messages Activate VIP/TOP promotion through admin/manual process 

## 4.4 Agent

Real-estate agent.

Can:

text Create and manage listings Receive messages from users View basic listing statistics Work with agency if linked 

## 4.5 Agency

Agency account / agency administrator.

Can:

text Manage agency profile Manage agency members Manage agency listings Receive leads/messages View basic statistics 

## 4.6 Landlord

Rental property owner.

Can:

text Publish rental listings Communicate with potential tenants Receive rental-related requests 

Tenant screening is Phase 2.

## 4.7 Property manager

Rental manager.

Can:

text Manage rental listings Communicate with potential tenants Coordinate rental inquiries 

Advanced rental application and tenant screening are Phase 2.

## 4.8 Moderator

Can:

text Review NEW listings Approve listings Send listings to DRAFT Reject listings Delete listings Review complaints Add moderation reason 

## 4.9 Admin

Can:

text Manage users Manage roles Manage agencies Manage listings Manage moderation queue Manage VIP/TOP promotions Manage dictionaries View audit logs View notification logs Configure system settings 

## 5. Languages and localization

Avino supports 3 languages:

text uz ru en 

Default language detection:

text browser language for web device language for mobile 

User can manually switch language.

All public UI must support 3 languages.

Listing text fields must support translations:

text title description address_note features_text 

User creates a listing in one language. The system automatically translates it into the other two languages.

Translation provider for MVP:

text Google Translate API or Yandex Translate API 

AI/LLM translation quality upgrade is not part of MVP.

## 6. Authentication requirements

Avino supports two login methods:

text SMS OTP Email OTP 

SMS provider:

text Eskiz.uz 

Auth flow:

text 1. User enters phone or email. 2. Backend sends OTP. 3. User enters OTP. 4. Backend verifies OTP. 5. Backend creates user if needed. 6. Backend returns access token and refresh token. 

Required auth features:

text Request OTP Verify OTP Refresh token Logout Profile creation/update Role-based access control Admin role management 

Security requirements:

text OTP is stored hashed Refresh token is stored hashed Refresh token rotation is required OTP rate limiting is required Login audit logs are required 

## 7. Listing requirements

## 7.1 Listing types

Transaction types:

text sale rent 

Property types:

text apartment house new_building land commercial 

## 7.2 Listing fields

Listing must support:

text Transaction type Property type Price Currency Area Rooms Floor Total floors Year built City District Address Latitude Longitude Map location Photos Title Description Features Owner/agent/agency link Status Promotion status Created date Published date 

## 7.3 Listing statuses

Supported statuses:

text NEW ACTIVE DRAFT REJECTED DELETED ARCHIVED SOLD RENTED 

MVP UI may show:

text NEW ACTIVE DRAFT DELETED 

## 7.4 Listing moderation flow

Required flow:

text User creates listing Listing status becomes NEW Moderator/admin reviews listing Moderator/admin changes status to ACTIVE / DRAFT / REJECTED / DELETED 

Rules:

text All listings go through moderation queue. Only ACTIVE listings are public. DELETED listings are soft-deleted. Auto-publish for trusted agencies is not part of MVP. 

## 8. Listing media requirements

Users can upload listing photos.

MVP media types:

text image/jpeg image/png image/webp 

Storage:

text S3-compatible storage 

Rules:

text Do not store files on application server filesystem. Validate file size and MIME type. Strip EXIF metadata, especially GPS metadata. Generate thumbnail if possible. Sort photos by sort_order. Video upload is Phase 2. 

## 9. Search requirements

Search must support:

text City District Address Transaction type Property type Price range Currency Area range Rooms Floor Total floors Year built Features Promotion type Map bounds Radius search Near me search Sorting Pagination 

Sorting options:

text promotion_priority_desc price_asc price_desc date_desc area_asc area_desc 

Default sorting:

text VIP first TOP second NORMAL third newest first inside each group id desc as final tiebreaker 

Public search returns only:

text status = ACTIVE 

## 10. Map requirements

Map provider:

text Yandex Maps 

Required map features:

text Show listing markers Show listing preview on marker click Search by visible map area Search by radius Near me search Select listing location during creation Marker clustering support 

Custom drawn polygon search is Phase 2.

Geo search must use:

text PostgreSQL + PostGIS 

## 11. Favorites requirements

Authenticated users can add listings to favorites.

Rules:

text Guest cannot create favorites. User cannot add same listing twice. Deleted/non-public listings should not appear in active favorites list. 

## 12. Saved searches requirements

Authenticated users can save search filters.

Saved search includes:

text Name Filters JSON Active/inactive status Last checked date 

When a new ACTIVE listing matches a saved search, the system sends notification.

MVP required notification:

text Email alert 

Future:

text Push notification In-app alert improvements 

Saved search filters must be versioned:

json {   "schemaVersion": 1,   "filters": {} } 

## 13. Notifications requirements

Notification types:

text saved_search_new_listing favorite_price_drop new_chat_message listing_moderation_status_changed new_lead promotion_activated promotion_expired 

Notification channels:

text email push in_app 

MVP requirement:

text Email + in-app notification support Push token registry prepared for mobile 

Notifications must be sent through background jobs, not directly inside request handlers.

Queue:

text Redis + BullMQ 

## 14. Internal chat requirements

MVP includes internal chat.

Users can send messages to listing creator:

text owner agent agency landlord property_manager 

Chat is linked to listing.

Thread model:

text One thread per listing + initiator + owner 

Rules:

text Guest cannot use chat. Deleted listing cannot start new chat. User cannot create duplicate thread for same listing and owner. New message creates notification job. MVP can use polling. WebSocket can be added later without changing DB contract. 

Chat field names:

text initiator_id owner_id 

Do not use:

text buyer_id seller_id 

Reason:

text Listings can be sale or rent, so initiator/owner is more accurate. 

## 15. VIP/TOP promotion requirements

Avino must support promoted listings.

Promotion types:

text NORMAL TOP VIP 

Priority:

text VIP > TOP > NORMAL 

Promotion periods:

text 7 days 14 days 30 days 

MVP implementation:

text Admin can manually activate VIP/TOP for a listing. Admin can cancel promotion. Admin can extend promotion. Promotion expires automatically through background job. Online payment is not required in MVP. 

Sorting rule:

text ACTIVE listings with active VIP promotion first ACTIVE listings with active TOP promotion second ACTIVE listings with NORMAL promotion third 

If promotion expires, listing must be treated as NORMAL.

Important:

text listing_promotions is the source of truth. listings.promotion_* fields are read cache. Only one ACTIVE promotion per listing is allowed. 

Online payment integration is Phase 1.5 after provider confirmation.

## 16. Admin panel requirements

Admin panel must support:

text User management Role management Agency management Listing moderation Listing status update Manual VIP/TOP promotion management Promotion logs Complaints management Notification logs Audit logs Basic dictionaries 

Moderation actions:

text approve send_to_draft reject delete 

Promotion actions:

text activate_vip activate_top cancel_promotion extend_promotion 

All sensitive admin actions must be logged.

## 17. Agency and landlord requirements

Agency features:

text Create agency profile Manage agency contacts Manage agency logo Manage agency members Link listings to agency 

Agent features:

text Create listing Manage own listings Receive messages View basic listing activity 

Landlord/property manager features:

text Create rental listings Manage rental listings Communicate with interested users 

Not MVP:

text Tenant screening Document verification Rental application scoring 

## 18. API requirements

Backend API must use versioning:

text /api/v1/<resource> 

Examples:

text POST /api/v1/auth/request-otp POST /api/v1/auth/verify-otp GET /api/v1/listings POST /api/v1/listings GET /api/v1/listings/:id GET /api/v1/search GET /api/v1/chat/threads GET /api/v1/promotions/plans POST /api/v1/admin/listings/:id/promotions 

Rules:

text Only v1 is implemented in MVP. Do not create v2 until a real breaking change. Unversioned API routes are forbidden. Web and mobile must call only versioned routes. 

## 19. Frontend requirements

Frontend stack:

text Next.js TypeScript RTK Query 

Frontend API rules:

text Use RTK Query for API access. Do not use random fetch or axios inside components. Centralize API layer in store/api. 

Required frontend areas:

text Home page Search page Map search Listing detail page Create listing flow User profile Favorites Saved searches Chat Notifications Agent/owner dashboard Admin/moderation panel VIP/TOP admin management Language switcher 

## 20. Mobile API requirements

Mobile app is developed separately in Flutter.

Backend must provide stable API for:

text Auth Profile Listings Search Map Favorites Saved searches Chat Notifications Uploads Promotions 

Mobile-specific features:

text GPS / near me search Push token registration Real-time or polling chat Saved listings Saved searches Notifications 

Mobile app implementation is not part of backend/web MVP, but API compatibility is required.

## 21. Background jobs

Use:

text Redis + BullMQ 

Required queues:

text translation_queue email_queue notification_queue saved_search_queue media_processing_queue promotion_queue 

Required jobs:

text translate_listing send_email send_saved_search_alert send_chat_notification process_uploaded_image expire_listing_promotions notify_promotion_status 

## 22. Security requirements

Security requirements:

text JWT access tokens Refresh token rotation OTP rate limiting Role-based access control Input validation File upload validation CORS configuration Admin audit logs Environment secrets outside git 

Sensitive actions to audit:

text login role_change listing_status_change listing_promotion_change delete_listing admin_user_update refresh_token_reuse 

## 23. Analytics requirements

MVP basic analytics:

text Listing views count Listing favorite count Listing chat leads count Admin dashboard basic counts 

Advanced analytics is Phase 2.

## 24. SEO requirements

Web platform should be SEO-friendly.

Required:

text Server-rendered listing pages where possible Readable listing URLs Meta title and description OpenGraph tags Sitemap support later Robots.txt Language-aware URLs or metadata 

Suggested URL examples:

text /listings/:id /ru/listings/:id /uz/listings/:id /en/listings/:id 

Final URL structure can be decided during frontend implementation.

## 25. Non-functional requirements

Performance:

text Search should be fast with indexes. Geo search should use PostGIS indexes. Image uploads should not block main request longer than necessary. Notifications must run in background jobs. 

Scalability:

text Backend must support web and mobile clients. API contracts must remain stable. Database indexes must support search and map use cases. 

Reliability:

text Promotion expiration must not depend only on background job. Expired promotion must be treated as NORMAL in SQL. Notifications should retry on failure. 

Maintainability:

text Follow CLAUDE.md rules. Each feature should be separate branch and PR. No direct push to main. No large unrelated PRs. 

## 26. MVP acceptance criteria

MVP is acceptable when:

text User can register/login by SMS or email. User can search active listings. User can search by filters and map. User can open listing detail. Owner/agent can create listing. Listing goes to NEW status. Admin can approve listing to ACTIVE. Only ACTIVE listings are public. Listing supports 3 language text records. Auto translation job exists. User can upload listing photos to S3. User can save favorites. User can create saved search. Saved search can trigger email notification. User can start chat with listing owner. Admin can manually activate VIP/TOP promotion. VIP listings appear above TOP and NORMAL. Expired promotion is treated as NORMAL. API routes use /api/v1. Frontend uses RTK Query. Basic audit logs exist. 

## 27. MVP risks

Main risks:

text Scope is large for first launch. Internal chat can increase implementation time. Auto translation adds external API dependency. Yandex Maps API limits/costs must be checked. Eskiz.uz SMS delivery must be tested early. PostGIS + Prisma requires raw SQL migrations. VIP/TOP sorting must be implemented carefully. 

Risk control:

text Build backend in small modules. Do not mix unrelated features in one PR. Use manual VIP/TOP activation first. Use polling chat first, WebSocket later. Keep API v1 stable. 

## 28. Development process

Claude must follow:

text CLAUDE.md ARCHITECTURE.md DB_SCHEMA.md PRD.md ROADMAP.md API.md TASKS.md 

Every logical improvement must be:

text separate branch 1–3 commits Pull Request pre-merge checklist 

No direct push to main.

Claude response must always include:

text A) Нужно заливать в GitHub: ДА/НЕТ B) Branch name C) Files changed D) Patch E) Git steps F) Pre-merge checklist 