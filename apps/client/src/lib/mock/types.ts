/**
 * Доменные типы публичного портала Avino (визуальная оболочка на моках).
 *
 * Базовые union-типы соответствуют docs/SPEC.md §7. Тип `Listing` — это
 * прагматичная «UI-модель», покрывающая поля мок-данных из
 * apps/claudeDesign/scripts/data.js плюс поля, нужные для детальной страницы.
 * Когда подключим реальный API (цикл 3) — мапперы приведут ответ к этой модели.
 */

export type Language = 'UZ' | 'RU' | 'EN';

export type Currency = 'UZS' | 'USD';

export type TransactionType = 'SALE' | 'RENT';

export type PropertyType =
  | 'APARTMENT'
  | 'HOUSE'
  | 'NEW_BUILDING'
  | 'LAND'
  | 'COMMERCIAL';

/** Все типы недвижимости (порядок — как в выпадающих списках UI). */
export const PROPERTY_TYPES: PropertyType[] = [
  'APARTMENT',
  'HOUSE',
  'NEW_BUILDING',
  'LAND',
  'COMMERCIAL',
];

export type ListingStatus =
  | 'NEW'
  | 'ACTIVE'
  | 'DRAFT'
  | 'REJECTED'
  | 'DELETED'
  | 'ARCHIVED'
  | 'SOLD'
  | 'RENTED';

/** Тип продвижения. NORMAL — без бейджа, TOP — красный, VIP — золотой. */
export type PromotionType = 'NORMAL' | 'TOP' | 'VIP';

/** Фото объявления (плейсхолдер picsum/unsplash в моках). */
export interface ListingPhoto {
  /** Полноразмерное изображение (для галереи/лайтбокса). */
  url: string;
  /** Уменьшенная версия (для карточки/превью). */
  thumb: string;
}

/** Контакт/автор объявления (в моках — упрощённо). */
export interface ListingAgent {
  name: string;
  /** true — Avino Pro (профессионал), false — частный собственник. */
  pro: boolean;
  /** Название агентства или «Частный собственник». */
  agency: string;
  /** Телефон для связи (опционально, для detail). */
  phone?: string;
}

/**
 * Объявление о недвижимости (UI-модель).
 *
 * Поля без `?` присутствуют во всех мок-листингах; опциональные могут
 * отсутствовать (например `rooms`/`floor` у участка или коммерции).
 */
export interface Listing {
  id: string;
  /** Тип сделки. */
  tx: TransactionType;
  /** Тип недвижимости. */
  type: PropertyType;
  /** Тип продвижения (иерархия VIP > TOP > NORMAL). */
  promo: PromotionType;

  /** Цена — строка (деньги НЕ number, см. SPEC.md §7). */
  price: string;
  currency: Currency;

  /** Площадь, м² (строка для совместимости с API Decimal). */
  area?: string;
  /** Кол-во комнат (нет у участка/коммерции). */
  rooms?: number;
  /** Этаж объекта. */
  floor?: number;
  /** Этажность здания. */
  totalFloors?: number;
  /** Год постройки/сдачи. */
  year?: number;

  /** Заголовок объявления. */
  title: string;
  /** Подробное описание (для detail). */
  desc?: string;
  /** Удобства/особенности. */
  features?: string[];

  /** Район Ташкента. */
  district: string;
  /** Точный адрес/массив. */
  address: string;
  /** Координаты для карты. */
  lat?: number;
  lng?: number;

  /** Набор фото (минимум одно). */
  photos: ListingPhoto[];

  /** Автор/контакт. */
  agent: ListingAgent;

  /** Дата публикации (ISO-строка; рендер — locale-aware relativeTime). */
  createdAt: string;

  /** Язык оригинала (на будущее, дефолт RU в моках). */
  originalLanguage?: Language;
  /** Статус (в публичной выдаче — всегда ACTIVE). */
  status?: ListingStatus;
}

/** Район с агрегатами (для блока «Районы» на главной). */
export interface District {
  /** Slug/идентификатор района. */
  id: string;
  /** Человекочитаемое название. */
  name: string;
  /** Кол-во активных объявлений в районе. */
  count: number;
}

/** Карточка агента/агентства (для блока «Агенты»). */
export interface Agent {
  id: string;
  name: string;
  pro: boolean;
  agency: string;
  /** Кол-во активных объявлений. */
  listingsCount: number;
}

/** Фильтр выдачи поиска. */
export interface ListingFilter {
  tx?: TransactionType;
  type?: PropertyType;
  district?: string;
  /** Точное число комнат (4 = «4+»). */
  rooms?: number;
  /** Диапазон цены (в единицах валюты объявления; грубый фильтр для моков). */
  priceMin?: number;
  priceMax?: number;
  /** Поиск по тексту (заголовок/адрес/район). */
  query?: string;
  /** Сортировка выдачи. */
  sort?: SortOption;
}

/** Варианты сортировки выдачи (соответствуют SPEC.md §6.2). */
export type SortOption =
  | 'promotion'
  | 'price_asc'
  | 'price_desc'
  | 'date_desc'
  | 'area_asc'
  | 'area_desc';
