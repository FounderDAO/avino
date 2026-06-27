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

export type ParkingType = 'YARD' | 'COVERED' | 'GARAGE' | 'UNDERGROUND';

/** Все типы парковки (порядок — как в выпадающих списках UI). */
export const PARKING_TYPES: ParkingType[] = ['YARD', 'COVERED', 'GARAGE', 'UNDERGROUND'];

/** Удобства объявления (ADR-0111, Zillow Phase 2). */
export type Amenity =
  | 'AIR_CONDITIONING'
  | 'FURNITURE'
  | 'APPLIANCES'
  | 'INTERNET'
  | 'ELEVATOR'
  | 'BALCONY'
  | 'HEATING'
  | 'SECURITY';

/** Все удобства (порядок — как в UI). */
export const AMENITIES: Amenity[] = [
  'AIR_CONDITIONING',
  'FURNITURE',
  'APPLIANCES',
  'INTERNET',
  'ELEVATOR',
  'BALCONY',
  'HEATING',
  'SECURITY',
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

/** Окно для экскурсии (время начала и конца). */
export interface TourWindow {
  start: string; // "07:00"
  end: string; // "10:00"
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
  /** Площадь участка, соток (только HOUSE+LAND). */
  lotArea?: string;
  /** Кол-во комнат (нет у участка/коммерции). */
  rooms?: number;
  /** Кол-во санузлов (нет у участка/коммерции). */
  bathrooms?: number;
  /** Тип парковки/гаража. */
  parkingType?: ParkingType;
  /** Удобства (структурированный список, ADR-0111). */
  amenities?: Amenity[];
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
  /** Доступны ли экскурсии для этого объявления. */
  toursEnabled?: boolean;
  /** Окна доступности для экскурсий. */
  tourWindows?: TourWindow[];
}

/** Район — справочник `GET /api/v1/geo/districts` (ADR-0068). */
export interface District {
  /** UUID района (для фильтра `?district_id=` и /search). */
  id: string;
  /** Человекочитаемое название на языке интерфейса. */
  name: string;
  /** Имена на других языках для матчинга подсказок (поиск на латинице). */
  aliases?: string[];
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
  /** Имя района (мок-фильтр `getListings`; реальный поиск использует `districtId`). */
  district?: string;
  /** UUID района для реального поиска (`?district_id=`, GET /search). */
  districtId?: string;
  /** Точное число комнат (4 = «4+»). */
  rooms?: number;
  /** Диапазон цены (в единицах валюты объявления; грубый фильтр для моков). */
  priceMin?: number;
  priceMax?: number;
  /** Поиск по тексту (заголовок/адрес/район). */
  query?: string;
  /** Сортировка выдачи. */
  sort?: SortOption;
  /**
   * Валюта, в которой заданы priceMin/priceMax (Task 14, TASK-currency-display).
   * Передаётся бэкенду только когда задан хотя бы один ценовой рубеж.
   */
  currency?: Currency;
  /** Мультивыбор типов жилья (Zillow Home Type). Пусто → все типы. */
  types?: PropertyType[];
  /** Мультивыбор типов парковки (parking_type IN). */
  parkingTypes?: ParkingType[];
  /** Мультивыбор удобств (AND-containment, ADR-0111). */
  amenities?: Amenity[];
  /** «N+ комнат» (rooms_min). */
  roomsMin?: number;
  /** «N+ санузлов» (bathrooms_min). */
  bathroomsMin?: number;
  /** Точное число комнат (режим «Точное совпадение»). */
  roomsExact?: number;
  areaMin?: number;
  areaMax?: number;
  lotAreaMin?: number;
  lotAreaMax?: number;
  floorMin?: number;
  floorMax?: number;
  notFirstFloor?: boolean;
  notLastFloor?: boolean;
  totalFloorsMin?: number;
  totalFloorsMax?: number;
  yearMin?: number;
  yearMax?: number;
  /** Источник объявления. */
  listingSource?: 'OWNER' | 'AGENCY';
  toursEnabled?: boolean;
}

/**
 * Гео-круг радиусного поиска (рисуется на карте, живёт в URL `?clat=&clng=&radius=`).
 * Бэкенд: GET /search/radius (API.md §10), radiusM — метры (1..50000).
 */
export interface RadiusCircle {
  lat: number;
  lng: number;
  radiusM: number;
}

/** Варианты сортировки выдачи (соответствуют SPEC.md §6.2). */
export type SortOption =
  | 'promotion'
  | 'price_asc'
  | 'price_desc'
  | 'date_desc'
  | 'area_asc'
  | 'area_desc';
