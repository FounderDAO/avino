/**
 * Мок-слой Avino — синхронные селекторы поверх массивов мок-данных.
 *
 * Это единственная точка доступа к данным для страниц фич (home/search/detail/
 * account). Сигнатуры стабильны: при подключении реального API (цикл 3) сюда
 * можно подставить RTK Query, не меняя вызовы в компонентах.
 */
import { LISTINGS, FALLBACK_PHOTO } from './listings';
import { AGENTS } from './agents';
import type {
  Agent,
  Listing,
  ListingFilter,
  PromotionType,
  SortOption,
} from './types';

export * from './types';
export { FALLBACK_PHOTO } from './listings';

/** Вес продвижения для сортировки по умолчанию (VIP > TOP > NORMAL). */
const PROMO_WEIGHT: Record<PromotionType, number> = { VIP: 2, TOP: 1, NORMAL: 0 };

/** Грубая нормализация цены к числу (для фильтра/сортировки в моках). */
const priceNum = (l: Listing): number => Number(l.price) || 0;
const areaNum = (l: Listing): number => Number(l.area) || 0;

/** Применяет сортировку к копии массива. */
function sortListings(list: Listing[], sort: SortOption = 'promotion'): Listing[] {
  const arr = [...list];
  switch (sort) {
    case 'price_asc':
      return arr.sort((a, b) => priceNum(a) - priceNum(b));
    case 'price_desc':
      return arr.sort((a, b) => priceNum(b) - priceNum(a));
    case 'area_asc':
      return arr.sort((a, b) => areaNum(a) - areaNum(b));
    case 'area_desc':
      return arr.sort((a, b) => areaNum(b) - areaNum(a));
    case 'date_desc':
      // У моков дата — относительная строка; держим исходный порядок (новее сверху).
      return arr;
    case 'promotion':
    default:
      // VIP → TOP → NORMAL, внутри группы — исходный порядок.
      return arr.sort((a, b) => PROMO_WEIGHT[b.promo] - PROMO_WEIGHT[a.promo]);
  }
}

/**
 * Возвращает листинги с учётом фильтра и сортировки.
 * Без аргумента — все листинги в дефолтной сортировке (promotion).
 */
export function getListings(filter: ListingFilter = {}): Listing[] {
  let list = LISTINGS;

  if (filter.tx) list = list.filter((l) => l.tx === filter.tx);
  if (filter.type) list = list.filter((l) => l.type === filter.type);
  if (filter.district) list = list.filter((l) => l.district === filter.district);

  if (filter.rooms != null) {
    // rooms = 4 трактуем как «4 и более».
    list = list.filter((l) =>
      filter.rooms === 4 ? (l.rooms ?? 0) >= 4 : l.rooms === filter.rooms,
    );
  }

  if (filter.priceMin != null) list = list.filter((l) => priceNum(l) >= filter.priceMin!);
  if (filter.priceMax != null) list = list.filter((l) => priceNum(l) <= filter.priceMax!);

  if (filter.query) {
    const q = filter.query.trim().toLowerCase();
    list = list.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        l.district.toLowerCase().includes(q),
    );
  }

  return sortListings(list, filter.sort);
}

/** Один листинг по id (или undefined). */
export function getListingById(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id);
}

/** Агенты/агентства. */
export function getAgents(): Agent[] {
  return AGENTS;
}

/**
 * Рекомендованные листинги для главной (приоритет VIP/TOP).
 * @param limit максимальное количество (по умолчанию 6).
 */
export function getFeaturedListings(limit = 6): Listing[] {
  return getListings({ sort: 'promotion' }).slice(0, limit);
}

/** Листинги по массиву id (для избранного). Сохраняет порядок мок-данных. */
export function getListingsByIds(ids: string[]): Listing[] {
  const set = new Set(ids);
  return LISTINGS.filter((l) => set.has(l.id));
}

/** Похожие листинги (тот же тип сделки, исключая текущий). */
export function getSimilarListings(listing: Listing, limit = 4): Listing[] {
  return LISTINGS.filter(
    (l) => l.id !== listing.id && l.tx === listing.tx && l.type === listing.type,
  )
    .concat(LISTINGS.filter((l) => l.id !== listing.id && l.tx === listing.tx && l.type !== listing.type))
    .slice(0, limit);
}

export { LISTINGS, FALLBACK_PHOTO as MOCK_FALLBACK_PHOTO };
