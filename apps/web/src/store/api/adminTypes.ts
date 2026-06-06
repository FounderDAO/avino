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
  | 'NEW_BUILDING'
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
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  /** Decimal-строка (никогда float, ADR-002). */
  price: string;
  currency: Currency;
  city_id: string | null;
  district_id: string | null;
  owner_id: string;
  /** Язык исходного (авторского) текста — на нём отдан `title` (§7, ADR-012). */
  original_language: Language;
  title: string;
  published_at: string | null;
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
 * detail-ответе бэкенд не отдаёт (только `features_text`).
 */
export interface ListingDetail {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  price: string;
  currency: Currency;
  area: string | null;
  rooms: number | null;
  floor: number | null;
  total_floors: number | null;
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

/** Запись ledger `listing_promotions` (§15). */
export interface ListingPromotion {
  id: string;
  listing_id: string;
  type: PromotionType;
  status: PromotionStatus;
  period_days: number;
  starts_at: string;
  expires_at: string;
  payment_status: PaymentStatus;
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

// ─── Параметры списков (фильтры + пагинация, §6/§15/§16) ─────────────────────

/** `GET /admin/listings` (§16). */
export interface AdminListingFilters extends PageParams {
  status?: ListingStatus;
  property_type?: PropertyType;
  transaction_type?: TransactionType;
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
