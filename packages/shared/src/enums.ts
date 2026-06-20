// Единый источник enum'ов проекта Avino (см. CLAUDE.md §9).
// Используется и backend (apps/api), и frontend (apps/web).
// Только enum-определения; производные коллекции и значения по умолчанию — в constants.ts.

/**
 * Роли пользователей. Значения UPPERCASE — совпадают с кодами в справочнике
 * `roles` (DB_SCHEMA.md §3/§4) и с JSON-контрактом API (`"roles": ["USER"]`).
 * GUEST — неявное состояние неаутентифицированного запроса: НЕ хранится в БД и
 * не является кодом роли (ADR-0008/ADR-011); оставлен здесь как логический
 * сентинел для authorization-кода.
 */
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  OWNER = 'OWNER',
  AGENT = 'AGENT',
  AGENCY = 'AGENCY',
  LANDLORD = 'LANDLORD',
  PROPERTY_MANAGER = 'PROPERTY_MANAGER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

/**
 * Поддерживаемые языки интерфейса и объявлений.
 * Значения UPPERCASE — совпадают с enum `language` в БД и JSON-контрактом API
 * (`"default_language": "RU"`). Lowercase uz|ru|en — только конвенция заголовка
 * Accept-Language/`?lang`, маппится на этот enum (API.md, ADR-0008).
 */
export enum Language {
  UZ = 'UZ',
  RU = 'RU',
  EN = 'EN',
}

/**
 * Статусы объявления.
 * Moderation flow: NEW → ACTIVE | DRAFT | REJECTED | DELETED.
 */
export enum ListingStatus {
  NEW = 'NEW',
  ACTIVE = 'ACTIVE',
  DRAFT = 'DRAFT',
  REJECTED = 'REJECTED',
  DELETED = 'DELETED',
  ARCHIVED = 'ARCHIVED',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
}

/** Типы недвижимости (значения совпадают с фильтром `property_type`, API.md §9). */
export enum PropertyType {
  APARTMENT = 'APARTMENT',
  HOUSE = 'HOUSE',
  NEW_BUILDING = 'NEW_BUILDING',
  COMMERCIAL = 'COMMERCIAL',
  LAND = 'LAND',
}

/** Типы сделок. */
export enum DealType {
  SALE = 'SALE',
  RENT = 'RENT',
}

/** Валюты. FX-конвертации в MVP нет (DB_SCHEMA.md §2). */
export enum Currency {
  UZS = 'UZS',
  USD = 'USD',
}

/**
 * Типы продвижения объявления (VIP/TOP модель, см. ADR-0004).
 * Приоритет: VIP > TOP > NORMAL. NORMAL — обычное объявление без продвижения
 * (значение по умолчанию для listings.promotionType).
 * Платная активация VIP/TOP в MVP выполняется вручную модератором до подключения онлайн-оплаты.
 */
export enum PromotionType {
  NORMAL = 'NORMAL',
  TOP = 'TOP',
  VIP = 'VIP',
}

/**
 * Статусы заявки на тур (просмотр). PENDING — создана покупателем; CONFIRMED/
 * DECLINED — решение владельца; CANCELLED — отмена покупателем. DECLINED/CANCELLED
 * терминальны. Зеркалит Prisma-enum `TourRequestStatus`.
 */
export enum TourRequestStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
}
