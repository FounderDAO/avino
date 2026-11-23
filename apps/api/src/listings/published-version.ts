import { ListingStatus, Prisma } from '@prisma/client';

/**
 * SEO AUD-9: одобренная версия объявления на время повторной модерации.
 *
 * Правка ACTIVE-объявления возвращает его в NEW (ADR-0120), и раньше публичная
 * карточка отдавала 404 до решения модератора — страница выпадала из индекса.
 * Теперь перед такой правкой содержимое объявления копируется в
 * `listing_published_versions`, и публичный read-path, пока объявление в
 * NEW/REJECTED, собирает карточку из этой копии.
 *
 * Владелец и модератор по-прежнему видят живую строку (с правкой): админка и
 * кабинет не меняются. Живыми остаются поля, которые не проходят модерацию:
 * контакт, продвижение, счётчики, даты публикации.
 *
 * Фото в копии — только id и порядок: показываются одобренные фото, которые
 * всё ещё есть у объявления. Удалённое владельцем фото пропадает сразу (могло
 * быть удалено из-за приватности), новое — появится только после одобрения.
 */

/** Содержимое объявления, которое проходит модерацию. */
export const PUBLISHED_VERSION_SELECT = {
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  area: true,
  lotArea: true,
  livingArea: true,
  nonLivingArea: true,
  rooms: true,
  bathrooms: true,
  parkingType: true,
  amenities: true,
  floor: true,
  isBasement: true,
  totalFloors: true,
  yearBuilt: true,
  address: true,
  addressEn: true,
  cityId: true,
  districtId: true,
  regionId: true,
  latitude: true,
  longitude: true,
  toursEnabled: true,
  tourWindows: true,
  contentUpdatedAt: true,
  translations: {
    select: {
      language: true,
      title: true,
      description: true,
      addressNote: true,
      featuresText: true,
      isAutoTranslated: true,
    },
  },
  media: {
    select: { id: true },
    orderBy: { sortOrder: Prisma.SortOrder.asc },
  },
  priceHistory: {
    select: { price: true, currency: true, createdAt: true },
    orderBy: { createdAt: Prisma.SortOrder.asc },
  },
} as const;

type PublishedVersionRow = Prisma.ListingGetPayload<{
  select: typeof PUBLISHED_VERSION_SELECT;
}>;

const DECIMAL_FIELDS = [
  'price',
  'area',
  'lotArea',
  'livingArea',
  'nonLivingArea',
  'bathrooms',
  'latitude',
  'longitude',
] as const;

type DecimalField = (typeof DECIMAL_FIELDS)[number];

/** Поля копии, которые переносятся на живую строку как есть (после оживления). */
type ContentFields = Omit<PublishedVersionRow, 'media' | 'priceHistory'>;

type PriceHistoryRow = PublishedVersionRow['priceHistory'][number];

/** JSON-формат `listing_published_versions.data`: Decimal — строки, даты — ISO. */
export type PublishedVersionData = Omit<ContentFields, DecimalField | 'contentUpdatedAt'> & {
  [K in DecimalField]: string | null;
} & {
  contentUpdatedAt: string;
  mediaIds: string[];
  priceHistory: { price: string; currency: PriceHistoryRow['currency']; createdAt: string }[];
};

/** Строка → JSON для хранения. */
export function toPublishedVersionData(row: PublishedVersionRow): PublishedVersionData {
  const { media, priceHistory, contentUpdatedAt, ...rest } = row;
  const data = { ...rest } as Record<string, unknown>;
  for (const field of DECIMAL_FIELDS) {
    data[field] = row[field]?.toString() ?? null;
  }
  return {
    ...(data as Omit<PublishedVersionData, 'contentUpdatedAt' | 'mediaIds' | 'priceHistory'>),
    contentUpdatedAt: contentUpdatedAt.toISOString(),
    mediaIds: media.map((m) => m.id),
    priceHistory: priceHistory.map((h) => ({
      price: h.price.toString(),
      currency: h.currency,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}

function reviveContent(data: PublishedVersionData): ContentFields {
  const { mediaIds: _mediaIds, priceHistory: _priceHistory, contentUpdatedAt, ...rest } = data;
  const content = { ...rest } as Record<string, unknown>;
  for (const field of DECIMAL_FIELDS) {
    const value = data[field];
    content[field] = value === null || value === undefined ? null : new Prisma.Decimal(value);
  }
  content.contentUpdatedAt = new Date(contentUpdatedAt);
  return content as ContentFields;
}

/** Минимум живой строки, нужный для наложения копии. */
interface LiveListing {
  status: ListingStatus;
  media: { id: string }[];
  priceHistory: PriceHistoryRow[];
}

/**
 * Публичная карточка из одобренной копии поверх живой строки.
 *
 * - статус — ACTIVE: посетитель видит опубликованное объявление;
 * - фото — одобренные, которые ещё есть у объявления, в одобренном порядке;
 * - история цены — на момент копии (новая цена ещё не одобрена).
 */
export function applyPublishedVersion<T extends LiveListing>(
  live: T,
  data: PublishedVersionData,
): T {
  const liveMedia = new Map(live.media.map((m) => [m.id, m]));
  const media = data.mediaIds
    .map((id) => liveMedia.get(id))
    .filter((m): m is T['media'][number] => m !== undefined);
  return {
    ...live,
    ...reviveContent(data),
    status: ListingStatus.ACTIVE,
    media,
    priceHistory: data.priceHistory.map((h) => ({
      price: new Prisma.Decimal(h.price),
      currency: h.currency,
      createdAt: new Date(h.createdAt),
    })),
  };
}

/** Статусы, в которых публичная карточка собирается из копии. */
export const PUBLISHED_VERSION_STATUSES: readonly ListingStatus[] = [
  ListingStatus.NEW,
  ListingStatus.REJECTED,
];

type Db = Pick<Prisma.TransactionClient, 'listing' | 'listingPublishedVersion'>;

/**
 * Сохранить текущее содержимое как одобренную версию — вызывается ПЕРЕД
 * правкой владельца, которая вернёт объявление на модерацию.
 *
 * Копируется только ACTIVE: его содержимое одобрено. Для REJECTED копия,
 * если есть, уже хранит последнюю одобренную версию и не трогается.
 * Повторный вызов для ACTIVE перезаписывает копию (одобренное содержимое
 * могло измениться после прошлой правки).
 */
export async function capturePublishedVersion(
  db: Db,
  listingId: string,
  status: ListingStatus,
): Promise<void> {
  if (status !== ListingStatus.ACTIVE) return;
  const row = await db.listing.findUnique({
    where: { id: listingId },
    select: PUBLISHED_VERSION_SELECT,
  });
  if (!row) return;
  const data = toPublishedVersionData(row) as unknown as Prisma.InputJsonValue;
  await db.listingPublishedVersion.upsert({
    where: { listingId },
    create: { listingId, data },
    update: { data, capturedAt: new Date() },
  });
}
