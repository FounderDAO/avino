/**
 * Адаптеры: API DTO листингов → UI-модель моков (AdminListing / SourceListing).
 * Цикл 3: страницы остаются на тех же сигнатурах, источник данных — RTK Query.
 *
 * Список `GET /admin/listings` отдаёт строку с комнатами/районом/просмотрами и
 * инлайн-профилем автора (колонка «Агент» — имя из owner). Промо в списке нет —
 * плейсхолдер. Детали `GET /listings/:id` дают почти всё (media, площадь,
 * комнаты, этаж, год, описание, features_text, промо); имени района и
 * просмотров в деталях нет — «—».
 */
import type {
  AdminListingOwner,
  AdminListingRow,
  ListingDetail,
  ListingStatus,
} from '@/store/api/adminApi';
import { FALLBACK_PHOTO, PROPERTY_TYPES, formatPrice } from '@/lib/mock';
import type {
  AdminListing,
  AdminListingStatus,
  ModerationItem,
  SourceListing,
} from '@/lib/mock';

const DASH = '—';

/**
 * Статичный список причин отклонения для очереди модерации (RU). В API причина —
 * free-form `reason`, поэтому набор фиксируем на фронте (как в моке).
 */
export const REJECT_REASON_OPTIONS: string[] = [
  'Некорректные фото',
  'Подозрение на дубликат',
  'Неверная цена',
  'Запрещённый контент',
  'Неполное описание',
  'Недостоверная информация',
];

/** API-статус листинга → статус UI-pill (5 значений мок-модели). */
export function apiToUiStatus(s: ListingStatus): AdminListingStatus {
  switch (s) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'NEW':
      return 'PENDING';
    case 'DRAFT':
      return 'DRAFT';
    case 'REJECTED':
      return 'REJECTED';
    case 'ARCHIVED':
    case 'DELETED':
    case 'SOLD':
    case 'RENTED':
      return 'ARCHIVED';
    default:
      return 'ACTIVE';
  }
}

/** Фильтр таблицы (UI) → значение `status` для `GET /admin/listings`. */
export const UI_FILTER_TO_API_STATUS: Record<string, ListingStatus | undefined> = {
  ALL: undefined,
  ACTIVE: 'ACTIVE',
  PENDING: 'NEW',
  REJECTED: 'REJECTED',
  DRAFT: 'DRAFT',
  ARCHIVED: 'ARCHIVED',
};

const TX_LABEL: Record<string, string> = { SALE: 'Продажа', RENT: 'Аренда' };

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : dateFmt.format(d);
}

/** Имя автора для колонки «Агент»: display_name → имя+фамилия → email → phone → «—». */
function ownerName(owner: AdminListingOwner | undefined): string {
  if (!owner) return DASH;
  const display = owner.display_name?.trim();
  if (display) return display;
  const full = [owner.first_name, owner.last_name]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return full || owner.email || owner.phone || DASH;
}

/** features_text (одна строка) → массив особенностей. */
function splitFeatures(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[\n;•]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Строка списка `GET /admin/listings` → UI-модель таблицы. priceRaw — заглушка
 * (таблица его не читает; нужна для совместимости типа AdminListing).
 */
export function rowToAdminListing(r: AdminListingRow): AdminListing {
  const stub: SourceListing = {
    id: r.id,
    tx: r.transaction_type,
    type: r.property_type,
    promo: 'NORMAL',
    price: r.price,
    currency: r.currency,
    area: null,
    rooms: r.rooms ?? null,
    floor: null,
    totalFloors: null,
    year: null,
    district: r.district_name ?? DASH,
    address: DASH,
    lat: null,
    lng: null,
    photos: [],
    title: r.title,
    desc: '',
    features: [],
    agent: { name: ownerName(r.owner), pro: false, agency: DASH },
    created: fmtDate(r.created_at),
  };
  return {
    id: r.id,
    title: r.title,
    // Главное фото из списка (sign-on-read, ADR-0086); нет фото / старый бэкенд
    // без поля → брендовый плейсхолдер.
    photo: r.photo_url ?? FALLBACK_PHOTO,
    price: formatPrice(
      { price: r.price, currency: r.currency, tx: r.transaction_type },
      { suffix: false },
    ),
    priceRaw: stub,
    type: PROPERTY_TYPES[r.property_type],
    rooms: r.rooms ?? DASH,
    district: r.district_name ?? DASH,
    agent: ownerName(r.owner),
    status: apiToUiStatus(r.status),
    views: r.views_count ?? DASH,
    created: fmtDate(r.created_at),
    promo: 'NORMAL',
    tx: TX_LABEL[r.transaction_type] ?? r.transaction_type,
  };
}

/**
 * Детали `GET /listings/:id` → UI-модель карточки (с реальными media/площадью/
 * комнатами/этажом/годом/описанием/features/промо).
 */
export function detailToAdminListing(d: ListingDetail): AdminListing {
  const src: SourceListing = {
    id: d.id,
    tx: d.transaction_type,
    type: d.property_type,
    promo: d.promotion_type,
    price: d.price,
    currency: d.currency,
    area: d.area,
    rooms: d.rooms,
    floor: d.floor,
    totalFloors: d.total_floors,
    year: d.year_built,
    district: DASH,
    address: d.address ?? DASH,
    lat: d.latitude ? Number(d.latitude) : null,
    lng: d.longitude ? Number(d.longitude) : null,
    photos: d.media.map((m) => ({ url: m.url, thumb: m.thumbnail_url ?? m.url })),
    title: d.title,
    desc: d.description ?? '',
    features: splitFeatures(d.features_text),
    agent: { name: DASH, pro: false, agency: DASH },
    created: fmtDate(d.created_at),
  };
  return {
    id: d.id,
    title: d.title,
    photo: src.photos[0]?.thumb ?? FALLBACK_PHOTO,
    price: formatPrice(
      { price: d.price, currency: d.currency, tx: d.transaction_type },
      { suffix: false },
    ),
    priceRaw: src,
    type: PROPERTY_TYPES[d.property_type],
    rooms: d.rooms ?? DASH,
    district: DASH,
    agent: DASH,
    status: apiToUiStatus(d.status),
    views: DASH,
    created: fmtDate(d.created_at),
    promo: d.promotion_type,
    tx: TX_LABEL[d.transaction_type] ?? d.transaction_type,
  };
}

/**
 * Строка очереди `GET /admin/listings?status=NEW` → `ModerationItem` (карточка
 * модерации). Переиспользует {@link rowToAdminListing}; список не отдаёт фото/
 * площадь/комнаты/район/описание — они приходят только в `ListingDetail`, тут
 * это пустой `photos`/«—»/пустое описание. `reasonOptions` — статичный RU-набор.
 */
export function rowToModerationItem(r: AdminListingRow): ModerationItem {
  const base = rowToAdminListing(r);
  return {
    ...base,
    full: base.priceRaw,
    reasonOptions: REJECT_REASON_OPTIONS,
  };
}
