// Единый источник enum'ов проекта Avino (см. CLAUDE.md §9).
// Используется и backend (apps/api), и frontend (apps/web).
// Только enum-определения; производные коллекции и значения по умолчанию — в constants.ts.

/** Роли пользователей. */
export enum UserRole {
  GUEST = 'guest',
  USER = 'user',
  OWNER = 'owner',
  AGENT = 'agent',
  AGENCY = 'agency',
  LANDLORD = 'landlord',
  PROPERTY_MANAGER = 'property_manager',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
}

/** Поддерживаемые языки интерфейса и объявлений. */
export enum Language {
  UZ = 'uz',
  RU = 'ru',
  EN = 'en',
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

/** Типы недвижимости. */
export enum PropertyType {
  APARTMENT = 'APARTMENT',
  HOUSE = 'HOUSE',
  COMMERCIAL = 'COMMERCIAL',
  LAND = 'LAND',
}

/** Типы сделок. */
export enum DealType {
  SALE = 'SALE',
  RENT = 'RENT',
}

/** Валюты. */
export enum CURRENCY {
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
