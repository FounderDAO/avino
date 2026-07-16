/**
 * Общие snake_case DTO и enum-типы админ-панели (ADMIN-07).
 *
 * Источники истины:
 * - enum-значения — `docs/DB_SCHEMA.md` §3 (значения = часть API-контракта);
 * - формы ответов — `docs/API.md` §6/§7/§15/§16.
 *
 * Эти типы переиспользуются задачами ADMIN-08..15 (очередь модерации, карточка,
 * жалобы, пользователи, промо, логи). Здесь — только данные; эндпоинты RTK Query
 * добавляются в `adminApi.ts`. Фильтр-типы наследуют `PageParams` (page-based, §4).
 */

import type { Language, UserStatus } from './authApi';
import type { PageParams } from './pagination';

// ─── Enums (DB_SCHEMA §3 — значения являются частью контракта) ───────────────

export type TransactionType = 'SALE' | 'RENT';
export type PropertyType =
  | 'APARTMENT'
  | 'HOUSE'
  | 'LAND'
  | 'COMMERCIAL';
export type ListingStatus =
  | 'NEW'
  | 'ACTIVE'
  | 'DRAFT'
  | 'REJECTED'
  | 'DELETED'
  | 'ARCHIVED'
  | 'SOLD'
  | 'RENTED';
export type Currency = 'UZS' | 'USD';

export type PromotionType = 'NORMAL' | 'TOP' | 'VIP';
export type PromotionStatus =
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUNDED';
export type PaymentStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED';
/** Допустимые периоды промо (§15). */
export type PromotionPeriodDays = 7 | 14 | 30;

export type ModerationAction = 'APPROVE' | 'SEND_TO_DRAFT' | 'REJECT' | 'DELETE';
export type PromotionAdminAction =
  | 'ACTIVATE_VIP'
  | 'ACTIVATE_TOP'
  | 'CANCEL_PROMOTION'
  | 'EXTEND_PROMOTION';

export type ComplaintStatus = 'NEW' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';

export type NotificationType =
  | 'SAVED_SEARCH_NEW_LISTING'
  | 'FAVORITE_PRICE_DROP'
  | 'NEW_CHAT_MESSAGE'
  | 'LISTING_MODERATION_STATUS_CHANGED'
  | 'NEW_LEAD'
  | 'PROMOTION_ACTIVATED'
  | 'PROMOTION_EXPIRED';
export type NotificationChannel = 'EMAIL' | 'PUSH' | 'IN_APP';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'READ';

/** Полный набор ролей-кодов (seeded dictionary, без `GUEST`; DB_SCHEMA §3/§4). */
export type RoleCode =
  | 'USER'
  | 'OWNER'
  | 'AGENT'
  | 'AGENCY'
  | 'LANDLORD'
  | 'PROPERTY_MANAGER'
  | 'MODERATOR'
  | 'ADMIN';

// ─── DTO: листинги (API.md §7/§16) ──────────────────────────────────────────

/**
 * Строка очереди модерации/админ-списка (`GET /admin/listings`, §16).
 *
 * Форма выверена live против бэкенда в ADMIN-08 (ADR-0050 откладывал сверку):
 * это зеркало `AdminListingListItem` из `apps/api/src/moderation`. Список —
 * компактная карточка: `title` берётся на `original_language` (исходный
 * авторский текст), `city_id` может быть `null`. Полей `area`/`rooms`/
 * `promotion_*` в списке нет — они приходят только в `ListingDetail` (§7).
 */
export interface AdminListingRow {
  id: string;
  /**
   * Публичный человекочитаемый номер объявления (ADR-0137). `optional`: старый
   * бэкенд поля не отдаёт — UI деградирует к «—».
   */
  reference?: number;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  /** Decimal-строка (никогда float, ADR-002). */
  price: string;
  currency: Currency;
  city_id: string | null;
  district_id: string | null;
  /**
   * Имя района (nameRu) для колонки «Район». `optional`: старый бэкенд поля
   * не отдаёт — UI деградирует к «—».
   */
  district_name?: string | null;
  /**
   * Точный адрес (из Яндекс-карты при создании) для строки списка. `optional`:
   * старый бэкенд поля не отдаёт — UI деградирует мягко (адрес не показывается).
   */
  address?: string | null;
  /** Число комнат (null для участков). `optional` — мягкая деградация к «—». */
  rooms?: number | null;
  /** Счётчик просмотров. `optional` — мягкая деградация к «—». */
  views_count?: number;
  owner_id: string;
  /**
   * Инлайн-профиль автора (ADR-0084) — чтобы карточка модерации показывала
   * «кто и когда создал» без ADMIN-only `GET /admin/users/:id`. `optional`:
   * старый бэкенд (до ADR-0084) поля не отдаёт — UI деградирует мягко.
   */
  owner?: AdminListingOwner;
  /** Язык исходного (авторского) текста — на нём отдан `title` (§7, ADR-012). */
  original_language: Language;
  title: string;
  /**
   * Свежий URL обложки (sign-on-read, ADR-0086) или `null`, если фото нет.
   * `optional`: старый бэкенд (до этого поля) его не отдаёт — UI падает на
   * плейсхолдер `FALLBACK_PHOTO`, не на ошибку.
   */
  photo_url?: string | null;
  published_at: string | null;
  created_at: string;
}

/**
 * Инлайн-профиль автора объявления в админ-очереди (`GET /admin/listings`, §16,
 * ADR-0084) — зеркало `AdminListingOwner` (`apps/api/src/moderation`). Минимум
 * для карточки модерации: имя (профиль), контакт, роли, статус аккаунта и дата
 * регистрации. Профильные поля nullable (профиль может быть не заполнен).
 */
export interface AdminListingOwner {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_phone: string | null;
  status: UserStatus;
  roles: RoleCode[];
  created_at: string;
}

/** Медиа-объект листинга (§7/§8). */
export interface ListingMedia {
  id: string;
  url: string;
  thumbnail_url: string | null;
  sort_order: number;
  type: 'IMAGE';
}

/**
 * Детали листинга (`GET /listings/:id`, §7) — для карточки модерации (ADMIN-09).
 *
 * Форма выверена live против `ListingDetailResponse` (`apps/api/src/listings`):
 * MODERATOR/ADMIN видят непубличные статусы через тот же публичный эндпоинт
 * (`OptionalJwtAuthGuard`); `DELETED` → всегда `404`. Поправки vs первичный
 * черновик ADMIN-07: `area`/`city_id` nullable, отдельного `features[]` в
 * detail-ответе бэкенд не отдаёт (только `features_text`). Поля
 * `is_basement`/`living_area`/`non_living_area`/`views_count`/`likes_count` —
 * добавлены по `LAST_CHANGED_API.md` §1.
 */
export interface ListingDetail {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  area: string | null;
  lot_area: string | null;
  /** Жилая площадь, м², Decimal-строка (`"95.00"`). */
  living_area: string | null;
  /** Нежилая площадь, м², Decimal-строка. */
  non_living_area: string | null;
  rooms: number | null;
  bathrooms: number | null;
  parking_type: 'YARD' | 'COVERED' | 'GARAGE' | 'UNDERGROUND' | null;
  amenities: string[];
  floor: number | null;
  total_floors: number | null;
  /** Цокольный этаж; `true` → `floor` отдаётся `null`. */
  is_basement: boolean;
  year_built: number | null;
  city_id: string | null;
  district_id: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  promotion_type: PromotionType;
  promotion_expires_at: string | null;
  owner_id: string;
  agency_id: string | null;
  /** Язык отданного перевода (§7, ADR-012). */
  language: Language;
  title: string;
  description: string | null;
  address_note: string | null;
  features_text: string | null;
  media: ListingMedia[];
  published_at: string | null;
  created_at: string;
  /** Счётчик просмотров. `optional` — мягкая деградация к «—» на старом бэкенде. */
  views_count?: number;
  /** Сколько пользователей добавили в избранное. `optional` — мягкая деградация. */
  likes_count?: number;
  /** Счётчик звонков (намерений позвонить). `optional` — мягкая деградация. */
  calls_count?: number;
}

/**
 * Тело `PATCH /admin/listings/:id/status` (§16). `action` маппится на статус
 * сервисом (APPROVE→ACTIVE, SEND_TO_DRAFT→DRAFT, REJECT→REJECTED, DELETE→DELETED).
 * `reason` опционален (пишется в moderation_logs/audit_logs).
 */
export interface ModerateListingRequest {
  action: ModerationAction;
  reason?: string | null;
}

/** Ответ `PATCH /admin/listings/:id/status` (§16). */
export interface ModerationResult {
  id: string;
  status: ListingStatus;
  published_at: string | null;
}

/**
 * Запись истории модерации листинга (`GET /admin/listings/:id/moderation-logs`,
 * §16). В отличие от глобального {@link ModerationLog}, per-listing ответ без
 * `listing_id` (он и так известен из маршрута).
 */
export interface ListingModerationLogEntry {
  id: string;
  action: ModerationAction;
  old_status: ListingStatus | null;
  new_status: ListingStatus | null;
  moderator_id: string | null;
  reason: string | null;
  created_at: string;
}

// ─── DTO: пользователи (API.md §6) ──────────────────────────────────────────

/**
 * Строка админ-списка пользователей (`GET /admin/users`, §6).
 *
 * Зеркало `AdminUserListItem` (`apps/api/src/admin`): тот же базовый набор, что
 * и `users/me`, плюс верификация контактов и таймстемпы. Профиль в списке не
 * отдаётся — только в карточке ({@link AdminUserDetail}). `roles` — коды ролей
 * (бэкенд отдаёт `string[]`; здесь сужаем до известного словаря).
 */
export interface AdminUserRow {
  id: string;
  phone: string | null;
  email: string | null;
  status: UserStatus;
  default_language: Language;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  roles: RoleCode[];
  /**
   * Число объявлений пользователя (без DELETED) — колонка «Объявл.».
   * `optional`: старый бэкенд поля не отдаёт — UI деградирует к 0.
   */
  listings_count?: number;
  last_login_at: string | null;
  created_at: string;
}

/**
 * Профиль пользователя (`user_profiles`, §5) — зеркало `ProfileResponse`
 * (`apps/api/src/profiles`). `preferred_language` nullable: профиль может быть
 * создан без явного выбора языка.
 */
export interface AdminUserProfile {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  contact_phone: string | null;
  preferred_language: Language | null;
}

/**
 * Карточка пользователя (`GET /admin/users/:id`, §6) — зеркало `AdminUserDetail`
 * (`apps/api/src/admin`): список + профиль и аудит-таймстемпы. `profile` может
 * быть `null` (профиль не заполнен). `deleted_at` — для soft-deleted (DELETED).
 */
export interface AdminUserDetail extends AdminUserRow {
  updated_at: string;
  deleted_at: string | null;
  profile: AdminUserProfile | null;
}

/**
 * Элемент справочника ролей (`GET /roles`, §6; таблица `roles`). Бэкенд
 * (`RoleResponse`) отдаёт только `code` + `description` — без `id`.
 */
export interface RoleDict {
  code: RoleCode;
  description: string | null;
}

/**
 * Тело `PATCH /admin/users/:id` (§6, ADMIN-12) — смена статуса. `reason`
 * опционален и попадает в `metadata` аудита `ADMIN_USER_UPDATE`. Бэкенд
 * возвращает обновлённый {@link AdminUserDetail} (а не пустой 200).
 */
export interface UpdateAdminUserStatusRequest {
  status: UserStatus;
  reason?: string | null;
}

/**
 * Тело `POST /admin/users/:id/roles` (§6, ADMIN-12) — назначение роли. Бэкенд
 * возвращает обновлённый {@link AdminUserDetail} (`201`). GUEST не сидируется
 * (ADR-0011) → `400 VALIDATION_ERROR`; повтор → `409 ROLE_ALREADY_GRANTED`.
 */
export interface AssignRoleRequest {
  role: RoleCode;
}

// ─── DTO: промо (API.md §15) ────────────────────────────────────────────────

/**
 * Тиры, активируемые вручную (`NORMAL` = «нет промо», не тариф; §15). Зеркало
 * `ActivatePromotionDto.ACTIVATABLE_TYPES` на бэкенде.
 */
export type ActivatablePromotionType = 'TOP' | 'VIP';

/**
 * Запись ledger `listing_promotions` (§15) — зеркало `PromotionResponse`
 * (`apps/api/src/promotions`). Ответ и `POST` (201, активация), и истории `GET`,
 * и `PATCH` cancel/extend. `starts_at`/`expires_at` nullable (бэкенд допускает
 * `null` для не-`ACTIVE` строк).
 */
export interface ListingPromotion {
  id: string;
  listing_id: string;
  type: PromotionType;
  status: PromotionStatus;
  period_days: number;
  starts_at: string | null;
  expires_at: string | null;
  payment_status: PaymentStatus;
}

/**
 * Тело `POST /admin/listings/:id/promotions` (§15, ADMIN-13) — ручная активация.
 * `type` — платный тариф (`TOP|VIP`); `period_days` ∈ {7,14,30} (иначе бэкенд →
 * `422 INVALID_PERIOD`). Идемпотентность — через заголовок `Idempotency-Key`
 * (а не тело). Бэкенд закрывает предыдущую `ACTIVE`-промо и возвращает новую (201).
 */
export interface ActivatePromotionRequest {
  type: ActivatablePromotionType;
  period_days: PromotionPeriodDays;
}

/**
 * Тело `PATCH /admin/listing-promotions/:id/cancel` (§15, ADMIN-13). `reason`
 * опционален (пишется в `promotion_logs.reason`). Ответ — обновлённая промо
 * (`status = CANCELLED`).
 */
export interface CancelPromotionRequest {
  reason?: string | null;
}

/**
 * Тело `PATCH /admin/listing-promotions/:id/extend` (§15, ADMIN-13). `period_days`
 * ∈ {7,14,30}; продлевает `expires_at`. Ошибки: `422 INVALID_PERIOD`,
 * `422 PROMOTION_NOT_ACTIVE`.
 */
export interface ExtendPromotionRequest {
  period_days: PromotionPeriodDays;
}

/**
 * Строка глобальной истории промо (`GET /admin/promotions`, ADMIN-16) — зеркало
 * `AdminPromotionRow` (`apps/api/src/admin/admin-promotions-overview.service.ts`).
 * Расширяет per-listing `ListingPromotion` полями сводной таблицы:
 * `listing_title` (на `original_language`), `user_id` (кто активировал),
 * `price`/`currency` (Decimal-строка, ADR-002), `created_at`.
 */
export interface AdminPromotionRow {
  id: string;
  listing_id: string;
  listing_title: string;
  user_id: string | null;
  type: PromotionType;
  status: PromotionStatus;
  period_days: number;
  price: string | null;
  currency: Currency | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/**
 * `GET /admin/promotions/summary` (ADMIN-16). Выручка — Decimal-строки
 * (ADR-002); в MVP тарифы в единой валюте (UZS), без разбивки по валютам.
 */
export interface AdminPromotionsSummary {
  active_count: number;
  revenue_month: string;
  revenue_total: string;
}

/** `GET /admin/promotions` (ADMIN-16). */
export interface AdminPromotionFilters extends PageParams {
  status?: PromotionStatus;
  type?: ActivatablePromotionType;
}

// ─── DTO: жалобы (API.md §16) ───────────────────────────────────────────────

/** Жалоба на листинг (`complaints`, §16). */
export interface Complaint {
  id: string;
  listing_id: string;
  user_id: string | null;
  reason: string;
  details: string | null;
  status: ComplaintStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

// ─── DTO: логи (API.md §16) ─────────────────────────────────────────────────

/** Security audit-лог (`audit_logs`, §16/ADR-004). `action` — free-form varchar. */
export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Журнал модерации (`moderation_logs`, §16). */
export interface ModerationLog {
  id: string;
  listing_id: string;
  moderator_id: string | null;
  action: ModerationAction;
  old_status: ListingStatus | null;
  new_status: ListingStatus | null;
  reason: string | null;
  created_at: string;
}

/** Журнал админских действий над промо (`promotion_logs`, §16). */
export interface PromotionLog {
  id: string;
  listing_promotion_id: string | null;
  listing_id: string;
  admin_id: string | null;
  action: PromotionAdminAction;
  old_type: PromotionType | null;
  new_type: PromotionType | null;
  old_expires_at: string | null;
  new_expires_at: string | null;
  reason: string | null;
  created_at: string;
}

/** Журнал уведомлений (`notifications`, §16). */
export interface NotificationLog {
  id: string;
  user_id: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string | null;
  body: string | null;
  data_json: Record<string, unknown> | null;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
}

// ─── DTO: заявки агентов (API.md §21, ADR-0140) ─────────────────────────────

/** Статус заявки «Стать агентом» (PG enum `AgentApplicationStatus`, §21). */
export type AgentApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Заявитель в админ-списке заявок (§21). `name` — display_name либо
 * «first last», иначе `null`; `avatar_url` резолвит бэкенд (ADR-0134).
 */
export interface AgentApplicationUser {
  id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

/**
 * Заявка «Стать агентом» (`agent_applications`, §21) — элемент
 * `GET /admin/agent-applications` и ответ approve/reject.
 */
export interface AgentApplication {
  id: string;
  status: AgentApplicationStatus;
  /** `null` — частный маклер (без агентства). */
  agency_name: string | null;
  about: string;
  reject_reason: string | null;
  moderator_id: string | null;
  created_at: string;
  resolved_at: string | null;
  user: AgentApplicationUser;
}

// ─── Параметры списков (фильтры + пагинация, §6/§15/§16) ─────────────────────

/** `GET /admin/listings` (§16). */
export interface AdminListingFilters extends PageParams {
  status?: ListingStatus;
  property_type?: PropertyType;
  transaction_type?: TransactionType;
  /** Точный поиск по номеру объявления (`listings.reference`, ADR-0137). */
  reference?: number;
  q?: string;
}

/** `GET /admin/users` (§6). */
export interface AdminUserFilters extends PageParams {
  status?: UserStatus;
  role?: RoleCode;
  q?: string;
}

/** `GET /admin/complaints` (§16). */
export interface ComplaintFilters extends PageParams {
  status?: ComplaintStatus;
  listing_id?: string;
}

/** `GET /admin/agent-applications` (§21). */
export interface AgentApplicationFilters extends PageParams {
  status?: AgentApplicationStatus;
}

/** `GET /admin/audit-logs` (§16). */
export interface AuditLogFilters extends PageParams {
  action?: string;
  actor_id?: string;
  entity_type?: string;
  entity_id?: string;
}

/** `GET /admin/moderation-logs` (§16). */
export interface ModerationLogFilters extends PageParams {
  listing_id?: string;
  moderator_id?: string;
  action?: ModerationAction;
}

/** `GET /admin/promotion-logs` (§16). */
export interface PromotionLogFilters extends PageParams {
  listing_id?: string;
  admin_id?: string;
  action?: PromotionAdminAction;
}

/** `GET /admin/notification-logs` (§16). */
export interface NotificationLogFilters extends PageParams {
  user_id?: string;
  type?: NotificationType;
  channel?: NotificationChannel;
  status?: NotificationStatus;
}

// ─── DTO: переводы листинга (API.md §7/§16, ADR-0091) ───────────────────────

/**
 * Язык перевода (ISO-639 uppercase, ADR-012). Совпадает с `Language` из authApi,
 * но вынесен отдельно для явной привязки к контракту переводов.
 */
export type TranslationLanguage = 'UZ' | 'RU' | 'EN';

/**
 * Одна языковая версия листинга (`listing_translations`, §7). `source` отражает
 * происхождение текста: `USER` — вручную, `GOOGLE`/`YANDEX` — машинный перевод.
 * Текстовые поля nullable (бэкенд допускает отсутствие описания/адреса/фичей).
 */
export interface TranslationItem {
  language: TranslationLanguage;
  source: 'USER' | 'GOOGLE' | 'YANDEX';
  is_auto_translated: boolean;
  title: string;
  description: string | null;
  address_note: string | null;
  features_text: string | null;
}

/**
 * Ответ `GET /listings/:id/translations` и мутаций (§7, ADR-0091).
 * `original_language` — язык исходного авторского текста (ADR-012).
 */
export interface ListingTranslations {
  listing_id: string;
  original_language: TranslationLanguage;
  translations: TranslationItem[];
}

/**
 * Тело `PATCH /admin/listings/:id/translations/:language` (§7, ADR-0091).
 * Только текстовые поля; `language` передаётся в path-параметре.
 */
export interface TranslationEditRequest {
  title: string;
  description?: string | null;
  address_note?: string | null;
  features_text?: string | null;
}

// ─── Дашборд (ADMIN-15, §16) ─────────────────────────────────────────────────

/** `GET /admin/stats` — сводные счётчики дашборда (ADMIN-15). */
export interface AdminStats {
  listings_new: number;
  complaints_new: number;
  users_total: number;
  promotions_active: number;
  /** Опубликованные объявления (`ListingStatus.ACTIVE`). */
  listings_active: number;
  /** Объявления в архиве (`ListingStatus.ARCHIVED`). */
  listings_archived: number;
  /** Активная витрина на продажу (`ACTIVE` + `SALE`). */
  listings_sale: number;
  /** Активная витрина в аренду (`ACTIVE` + `RENT`). */
  listings_rent: number;
  /** Заявки «Стать агентом» в очереди на решение (`PENDING`). */
  agent_applications_new: number;
}

/** Один помесячный бакет ряда «объявления за год» (12 точек, старые→новые). */
export interface AdminMonthlyCount {
  /** Метка месяца `YYYY-MM`. */
  month: string;
  count: number;
}

/** Район + локализованные имена + число объявлений (столбчатый график). */
export interface AdminDistrictCount {
  district_id: string;
  name_ru: string;
  name_uz: string;
  name_en: string;
  count: number;
}

/** Запись «последних действий» (из журнала модерации). */
export interface AdminActivityItem {
  id: string;
  action: ModerationAction;
  new_status: ListingStatus | null;
  listing_id: string;
  listing_title: string | null;
  moderator_name: string | null;
  created_at: string;
}

/**
 * `GET /admin/analytics` — данные графиков дашборда (зеркало
 * `AdminAnalyticsResponse` из `apps/api/src/admin`). `buy_rent` — сырые
 * счётчики (проценты считает фронт), `by_district` — топ-6.
 */
export interface AdminAnalytics {
  listings_over_time: AdminMonthlyCount[];
  buy_rent: { buy: number; rent: number };
  by_district: AdminDistrictCount[];
  recent_activity: AdminActivityItem[];
}

// ─── DTO: тарифы и настройки промо (API.md §15) ─────────────────────────────

/**
 * Тариф промо (`GET /admin/promotion-plans`). `price` — decimal-строка (ADR-002).
 * Редактируется через `PATCH /admin/promotion-plans/:id` (`price?`, `isActive?`).
 */
export interface AdminPromotionPlan {
  id: string;
  type: 'TOP' | 'VIP';
  period_days: 7 | 14 | 30;
  price: string;
  currency: 'UZS' | 'USD';
  isActive: boolean;
}

/**
 * Настройки промо (`GET`/`PATCH /admin/promotion-settings`). `expiryIntervalHours`
 * — интервал проверки истечения промо (6 или 12 часов).
 */
export interface PromotionSettings {
  expiryIntervalHours: 6 | 12;
}
