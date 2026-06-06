/**
 * i18n админ-панели (ADMIN-17) — подписи enum-значений по локалям.
 *
 * Значения enum — часть API-контракта (DB_SCHEMA §3 / API.md). Текстовые подписи
 * раньше жили RU-only в `lib/labels.ts`, `lib/users.ts`, `lib/complaints.ts`,
 * `lib/moderation.ts`, `lib/promotions.ts`, `lib/logs.ts`; здесь они собраны по
 * локалям. Badge/intent-классы (CSS, не текст) остаются в доменных хелперах.
 *
 * `getEnumLabels(locale)` — для не-React кода (хелперы ошибок и т.п.);
 * `useEnumLabels()` — хук для компонентов (берёт текущую локаль из useT).
 */

import type { Language, UserStatus } from '@/store/api/authApi';
import type {
  ComplaintStatus,
  ListingStatus,
  ModerationAction,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  PromotionAdminAction,
  PromotionStatus,
  PromotionType,
  PropertyType,
  RoleCode,
  TransactionType,
} from '@/store/api/adminTypes';

import { type Locale } from './config';
import { useT } from './LanguageProvider';

type ByLocale<T extends string> = Record<Locale, Record<T, string>>;

const LISTING_STATUS: ByLocale<ListingStatus> = {
  ru: {
    NEW: 'На модерации',
    ACTIVE: 'Активно',
    DRAFT: 'Черновик',
    REJECTED: 'Отклонено',
    DELETED: 'Удалено',
    ARCHIVED: 'В архиве',
    SOLD: 'Продано',
    RENTED: 'Сдано',
  },
  uz: {
    NEW: 'Moderatsiyada',
    ACTIVE: 'Faol',
    DRAFT: 'Qoralama',
    REJECTED: 'Rad etilgan',
    DELETED: "O'chirilgan",
    ARCHIVED: 'Arxivda',
    SOLD: 'Sotilgan',
    RENTED: 'Ijaraga berilgan',
  },
  en: {
    NEW: 'Pending review',
    ACTIVE: 'Active',
    DRAFT: 'Draft',
    REJECTED: 'Rejected',
    DELETED: 'Deleted',
    ARCHIVED: 'Archived',
    SOLD: 'Sold',
    RENTED: 'Rented',
  },
};

const PROPERTY_TYPE: ByLocale<PropertyType> = {
  ru: {
    APARTMENT: 'Квартира',
    HOUSE: 'Дом',
    NEW_BUILDING: 'Новостройка',
    LAND: 'Участок',
    COMMERCIAL: 'Коммерческая',
  },
  uz: {
    APARTMENT: 'Kvartira',
    HOUSE: 'Uy',
    NEW_BUILDING: 'Yangi qurilish',
    LAND: 'Yer uchastkasi',
    COMMERCIAL: 'Tijorat',
  },
  en: {
    APARTMENT: 'Apartment',
    HOUSE: 'House',
    NEW_BUILDING: 'New building',
    LAND: 'Land',
    COMMERCIAL: 'Commercial',
  },
};

const TRANSACTION_TYPE: ByLocale<TransactionType> = {
  ru: { SALE: 'Продажа', RENT: 'Аренда' },
  uz: { SALE: 'Sotuv', RENT: 'Ijara' },
  en: { SALE: 'Sale', RENT: 'Rent' },
};

const USER_STATUS: ByLocale<UserStatus> = {
  ru: { ACTIVE: 'Активен', BLOCKED: 'Заблокирован', DELETED: 'Удалён' },
  uz: { ACTIVE: 'Faol', BLOCKED: 'Bloklangan', DELETED: "O'chirilgan" },
  en: { ACTIVE: 'Active', BLOCKED: 'Blocked', DELETED: 'Deleted' },
};

const USER_STATUS_ACTION: ByLocale<UserStatus> = {
  ru: { ACTIVE: 'Активировать', BLOCKED: 'Заблокировать', DELETED: 'Удалить' },
  uz: { ACTIVE: 'Faollashtirish', BLOCKED: 'Bloklash', DELETED: "O'chirish" },
  en: { ACTIVE: 'Activate', BLOCKED: 'Block', DELETED: 'Delete' },
};

const ROLE: ByLocale<RoleCode> = {
  ru: {
    USER: 'Пользователь',
    OWNER: 'Собственник',
    AGENT: 'Агент',
    AGENCY: 'Агентство',
    LANDLORD: 'Арендодатель',
    PROPERTY_MANAGER: 'Управляющий',
    MODERATOR: 'Модератор',
    ADMIN: 'Администратор',
  },
  uz: {
    USER: 'Foydalanuvchi',
    OWNER: 'Mulkdor',
    AGENT: 'Agent',
    AGENCY: 'Agentlik',
    LANDLORD: 'Ijaraga beruvchi',
    PROPERTY_MANAGER: 'Boshqaruvchi',
    MODERATOR: 'Moderator',
    ADMIN: 'Administrator',
  },
  en: {
    USER: 'User',
    OWNER: 'Owner',
    AGENT: 'Agent',
    AGENCY: 'Agency',
    LANDLORD: 'Landlord',
    PROPERTY_MANAGER: 'Property manager',
    MODERATOR: 'Moderator',
    ADMIN: 'Administrator',
  },
};

const LANGUAGE: ByLocale<Language> = {
  ru: { UZ: 'Узбекский', RU: 'Русский', EN: 'Английский' },
  uz: { UZ: "O'zbekcha", RU: 'Ruscha', EN: 'Inglizcha' },
  en: { UZ: 'Uzbek', RU: 'Russian', EN: 'English' },
};

const COMPLAINT_STATUS: ByLocale<ComplaintStatus> = {
  ru: {
    NEW: 'Новая',
    IN_REVIEW: 'В работе',
    RESOLVED: 'Решена',
    REJECTED: 'Отклонена',
  },
  uz: {
    NEW: 'Yangi',
    IN_REVIEW: "Ko'rib chiqilmoqda",
    RESOLVED: 'Hal qilingan',
    REJECTED: 'Rad etilgan',
  },
  en: {
    NEW: 'New',
    IN_REVIEW: 'In review',
    RESOLVED: 'Resolved',
    REJECTED: 'Rejected',
  },
};

const MODERATION_ACTION: ByLocale<ModerationAction> = {
  ru: {
    APPROVE: 'Одобрить',
    SEND_TO_DRAFT: 'В черновик',
    REJECT: 'Отклонить',
    DELETE: 'Удалить',
  },
  uz: {
    APPROVE: 'Tasdiqlash',
    SEND_TO_DRAFT: 'Qoralamaga',
    REJECT: 'Rad etish',
    DELETE: "O'chirish",
  },
  en: {
    APPROVE: 'Approve',
    SEND_TO_DRAFT: 'To draft',
    REJECT: 'Reject',
    DELETE: 'Delete',
  },
};

const PROMOTION_TYPE: ByLocale<PromotionType> = {
  ru: { NORMAL: 'Без промо', TOP: 'TOP', VIP: 'VIP' },
  uz: { NORMAL: 'Promosiz', TOP: 'TOP', VIP: 'VIP' },
  en: { NORMAL: 'No promotion', TOP: 'TOP', VIP: 'VIP' },
};

const PROMOTION_STATUS: ByLocale<PromotionStatus> = {
  ru: {
    PENDING_PAYMENT: 'Ожидает оплаты',
    ACTIVE: 'Активна',
    EXPIRED: 'Истекла',
    CANCELLED: 'Отменена',
    REFUNDED: 'Возврат',
  },
  uz: {
    PENDING_PAYMENT: "To'lov kutilmoqda",
    ACTIVE: 'Faol',
    EXPIRED: 'Muddati tugagan',
    CANCELLED: 'Bekor qilingan',
    REFUNDED: 'Qaytarilgan',
  },
  en: {
    PENDING_PAYMENT: 'Pending payment',
    ACTIVE: 'Active',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
  },
};

const PROMOTION_ADMIN_ACTION: ByLocale<PromotionAdminAction> = {
  ru: {
    ACTIVATE_VIP: 'Активация VIP',
    ACTIVATE_TOP: 'Активация TOP',
    CANCEL_PROMOTION: 'Отмена промо',
    EXTEND_PROMOTION: 'Продление промо',
  },
  uz: {
    ACTIVATE_VIP: 'VIP faollashtirish',
    ACTIVATE_TOP: 'TOP faollashtirish',
    CANCEL_PROMOTION: 'Promoni bekor qilish',
    EXTEND_PROMOTION: 'Promoni uzaytirish',
  },
  en: {
    ACTIVATE_VIP: 'Activate VIP',
    ACTIVATE_TOP: 'Activate TOP',
    CANCEL_PROMOTION: 'Cancel promotion',
    EXTEND_PROMOTION: 'Extend promotion',
  },
};

const NOTIFICATION_TYPE: ByLocale<NotificationType> = {
  ru: {
    SAVED_SEARCH_NEW_LISTING: 'Новое по сохранённому поиску',
    FAVORITE_PRICE_DROP: 'Снижение цены в избранном',
    NEW_CHAT_MESSAGE: 'Новое сообщение в чате',
    LISTING_MODERATION_STATUS_CHANGED: 'Смена статуса модерации',
    NEW_LEAD: 'Новый лид',
    PROMOTION_ACTIVATED: 'Промо активировано',
    PROMOTION_EXPIRED: 'Промо истекло',
  },
  uz: {
    SAVED_SEARCH_NEW_LISTING: "Saqlangan qidiruv bo'yicha yangi",
    FAVORITE_PRICE_DROP: 'Sevimlida narx tushdi',
    NEW_CHAT_MESSAGE: 'Chatda yangi xabar',
    LISTING_MODERATION_STATUS_CHANGED: "Moderatsiya holati o'zgardi",
    NEW_LEAD: 'Yangi lid',
    PROMOTION_ACTIVATED: 'Promo faollashtirildi',
    PROMOTION_EXPIRED: 'Promo muddati tugadi',
  },
  en: {
    SAVED_SEARCH_NEW_LISTING: 'New for saved search',
    FAVORITE_PRICE_DROP: 'Favorite price drop',
    NEW_CHAT_MESSAGE: 'New chat message',
    LISTING_MODERATION_STATUS_CHANGED: 'Moderation status changed',
    NEW_LEAD: 'New lead',
    PROMOTION_ACTIVATED: 'Promotion activated',
    PROMOTION_EXPIRED: 'Promotion expired',
  },
};

const NOTIFICATION_CHANNEL: ByLocale<NotificationChannel> = {
  ru: { EMAIL: 'Email', PUSH: 'Push', IN_APP: 'В приложении' },
  uz: { EMAIL: 'Email', PUSH: 'Push', IN_APP: 'Ilovada' },
  en: { EMAIL: 'Email', PUSH: 'Push', IN_APP: 'In-app' },
};

const NOTIFICATION_STATUS: ByLocale<NotificationStatus> = {
  ru: {
    PENDING: 'В очереди',
    SENT: 'Отправлено',
    FAILED: 'Ошибка',
    READ: 'Прочитано',
  },
  uz: {
    PENDING: 'Navbatda',
    SENT: 'Yuborilgan',
    FAILED: 'Xato',
    READ: "O'qilgan",
  },
  en: {
    PENDING: 'Pending',
    SENT: 'Sent',
    FAILED: 'Failed',
    READ: 'Read',
  },
};

/** Полный набор локализованных enum-подписей для одной локали. */
export interface EnumLabels {
  listingStatus: Record<ListingStatus, string>;
  propertyType: Record<PropertyType, string>;
  transactionType: Record<TransactionType, string>;
  userStatus: Record<UserStatus, string>;
  userStatusAction: Record<UserStatus, string>;
  role: Record<RoleCode, string>;
  language: Record<Language, string>;
  complaintStatus: Record<ComplaintStatus, string>;
  moderationAction: Record<ModerationAction, string>;
  promotionType: Record<PromotionType, string>;
  promotionStatus: Record<PromotionStatus, string>;
  promotionAdminAction: Record<PromotionAdminAction, string>;
  notificationType: Record<NotificationType, string>;
  notificationChannel: Record<NotificationChannel, string>;
  notificationStatus: Record<NotificationStatus, string>;
}

/** Локализованные enum-подписи для не-React кода (хелперы и т.п.). */
export function getEnumLabels(locale: Locale): EnumLabels {
  return {
    listingStatus: LISTING_STATUS[locale],
    propertyType: PROPERTY_TYPE[locale],
    transactionType: TRANSACTION_TYPE[locale],
    userStatus: USER_STATUS[locale],
    userStatusAction: USER_STATUS_ACTION[locale],
    role: ROLE[locale],
    language: LANGUAGE[locale],
    complaintStatus: COMPLAINT_STATUS[locale],
    moderationAction: MODERATION_ACTION[locale],
    promotionType: PROMOTION_TYPE[locale],
    promotionStatus: PROMOTION_STATUS[locale],
    promotionAdminAction: PROMOTION_ADMIN_ACTION[locale],
    notificationType: NOTIFICATION_TYPE[locale],
    notificationChannel: NOTIFICATION_CHANNEL[locale],
    notificationStatus: NOTIFICATION_STATUS[locale],
  };
}

/** Хук: локализованные enum-подписи для текущей локали интерфейса. */
export function useEnumLabels(): EnumLabels {
  const { locale } = useT();
  return getEnumLabels(locale);
}

/** Подпись роли по коду (неизвестный код → сам код, чтобы не падать). */
export function roleLabel(code: string, locale: Locale): string {
  return ROLE[locale][code as RoleCode] ?? code;
}

/** Подпись языка объявления (nullable → «—»). */
export function languageLabel(
  lang: Language | null | undefined,
  locale: Locale,
): string {
  if (!lang) return '—';
  return LANGUAGE[locale][lang] ?? lang;
}
