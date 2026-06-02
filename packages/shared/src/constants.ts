// Производные константы проекта Avino (см. CLAUDE.md §9).
// Только данные: коллекции кодов и значения по умолчанию для backend (apps/api) и frontend (apps/web).
// Никакой бизнес-логики здесь быть не должно.

import {
  CURRENCY,
  DealType,
  Language,
  ListingStatus,
  PromotionType,
  PropertyType,
  UserRole,
} from './enums';

/** Язык по умолчанию (если не удалось определить по браузеру/телефону). */
export const DEFAULT_LANGUAGE = Language.RU;

/** Валюта по умолчанию. */
export const DEFAULT_CURRENCY = CURRENCY.UZS;

/** Все роли пользователей. */
export const USER_ROLES = [
  UserRole.GUEST,
  UserRole.USER,
  UserRole.OWNER,
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.LANDLORD,
  UserRole.PROPERTY_MANAGER,
  UserRole.MODERATOR,
  UserRole.ADMIN,
] as const;

/** Все поддерживаемые языки. */
export const SUPPORTED_LANGUAGES = [
  Language.UZ,
  Language.RU,
  Language.EN,
] as const;

/** Все статусы объявления. */
export const LISTING_STATUSES = [
  ListingStatus.NEW,
  ListingStatus.ACTIVE,
  ListingStatus.DRAFT,
  ListingStatus.REJECTED,
  ListingStatus.DELETED,
  ListingStatus.ARCHIVED,
  ListingStatus.SOLD,
  ListingStatus.RENTED,
] as const;

/** Статусы, которые MVP UI показывает на первом этапе. */
export const MVP_LISTING_STATUSES = [
  ListingStatus.NEW,
  ListingStatus.ACTIVE,
  ListingStatus.DRAFT,
  ListingStatus.DELETED,
] as const;

/** Все типы недвижимости. */
export const PROPERTY_TYPES = [
  PropertyType.APARTMENT,
  PropertyType.HOUSE,
  PropertyType.COMMERCIAL,
  PropertyType.LAND,
] as const;

/** Все типы сделок. */
export const DEAL_TYPES = [DealType.SALE, DealType.RENT] as const;

/** Все валюты. */
export const SUPPORTED_CURRENCIES = [CURRENCY.UZS, CURRENCY.USD] as const;

/** Типы платного продвижения (VIP/TOP). */
export const PROMOTION_TYPES = [PromotionType.VIP, PromotionType.TOP] as const;
