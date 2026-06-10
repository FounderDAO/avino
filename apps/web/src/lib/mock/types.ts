/**
 * Доменные типы админки Avino (визуальная оболочка на моках).
 * Источник: apps/claudeDesign/scripts/{data.js,admin-data.js}. Цикл 3 заменит
 * мок-слой на RTK Query, сохранив эти сигнатуры.
 */

export type TransactionType = 'SALE' | 'RENT';

export type PropertyType =
  | 'APARTMENT'
  | 'HOUSE'
  | 'NEW_BUILDING'
  | 'LAND'
  | 'COMMERCIAL';

export type PromotionType = 'NORMAL' | 'TOP' | 'VIP';

/** Статус объявления в админке (модерация). */
export type AdminListingStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'REJECTED'
  | 'DRAFT'
  | 'ARCHIVED';

/** Роли пользователей. */
export type Role =
  | 'User'
  | 'Owner'
  | 'Agent'
  | 'Agency'
  | 'Landlord'
  | 'Moderator'
  | 'Admin';

export interface ListingPhoto {
  url: string;
  thumb: string;
}

export interface SourceAgent {
  name: string;
  pro: boolean;
  agency: string;
}

/** Полный исходный листинг (порт data.js) — нужен на detail-странице. */
export interface SourceListing {
  id: string;
  tx: TransactionType;
  type: PropertyType;
  promo: PromotionType;
  price: string;
  currency: 'UZS' | 'USD';
  area: string | null;
  rooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  year: number | null;
  district: string;
  address: string;
  lat: number | null;
  lng: number | null;
  photos: ListingPhoto[];
  title: string;
  desc: string;
  features: string[];
  agent: SourceAgent;
  created: string;
}

/** Строка таблицы объявлений в админке (порт admin-data.js → listings). */
export interface AdminListing {
  id: string;
  title: string;
  photo: string;
  /** Отформатированная цена без суффикса (например «$98 000»). */
  price: string;
  /** Полный исходный объект для detail. */
  priceRaw: SourceListing;
  /** Человекочитаемый тип недвижимости. */
  type: string;
  rooms: number | string;
  district: string;
  agent: string;
  status: AdminListingStatus;
  /** Число просмотров; «—», когда источник (API) не отдаёт метрику. */
  views: number | string;
  created: string;
  promo: PromotionType;
  /** «Аренда» / «Продажа». */
  tx: string;
}

/** Объект очереди модерации. */
export interface ModerationItem extends AdminListing {
  full: SourceListing;
  reasonOptions: string[];
}

export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: Role;
  listings: number;
  status: 'active' | 'blocked';
  joined: string;
  verified: boolean;
}

export interface AdminAgent {
  id: string;
  name: string;
  agency: string;
  listings: number;
  deals: number;
  rating: number;
  plan: 'VIP' | 'Pro';
}

export interface Kpi {
  label: string;
  value: string;
  delta: string;
  up?: boolean;
  accent?: 'warn';
}

export interface ActivityItem {
  who: string;
  act: string;
  what: string;
  time: string;
}

/** Тариф продвижения: цена (в сумах) по сроку в днях. */
export type PromoPricing = Record<'TOP' | 'VIP', Record<number, number>>;

export interface PromoHistoryItem {
  id: string;
  listing: string;
  user: string;
  type: 'TOP' | 'VIP';
  days: number;
  bought: string;
  expires: string;
  status: 'active' | 'expired';
  amount: number;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actor: string;
  ip: string;
  when: string;
}

export interface ModerationLog {
  id: string;
  action: 'APPROVE' | 'REJECT';
  listing: string;
  moderator: string;
  reason: string;
  when: string;
}

export interface PromoLog {
  id: string;
  listing: string;
  buyer: string;
  type: 'TOP' | 'VIP';
  days: number;
  amount: number;
  when: string;
}

export interface NotificationLog {
  id: string;
  type: string;
  recipient: string;
  channel: string;
  status: 'sent' | 'failed';
  when: string;
}

export interface Logs {
  audit: AuditLog[];
  moderation: ModerationLog[];
  promo: PromoLog[];
  notifications: NotificationLog[];
}

/** [label, color, background] для статус-pill. */
export type StatusMap = Record<AdminListingStatus, [string, string, string]>;
