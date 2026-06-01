// Единый источник enum'ов проекта Avino (см. CLAUDE.md §9).
// Используется и backend (apps/api), и frontend (apps/web).

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

export const DEFAULT_LANGUAGE = Language.RU;

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

/** Статусы, которые MVP UI показывает на первом этапе. */
export const MVP_LISTING_STATUSES: ListingStatus[] = [
  ListingStatus.NEW,
  ListingStatus.ACTIVE,
  ListingStatus.DRAFT,
  ListingStatus.DELETED,
];
