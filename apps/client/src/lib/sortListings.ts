/**
 * sortListings — клиентская сортировка выдачи /search (реплика гибрида ADR-0117).
 *
 * Сорт применяется к УЖЕ загруженному списку без запроса к API: смена сорта не
 * ходит на сервер (запрос только при смене города/карты/территории/фильтров).
 * В режимах карта/территория сервер сорт вообще игнорирует (`date_desc`), так что
 * клиентская сортировка — единственный способ, которым сорт там работает.
 *
 * Семантика (паритет с бэкендом, SearchService):
 * - `promotion` (дефолт): полный промо-приоритет `tier desc, createdAt desc, id desc`.
 * - Явный сорт (price/area/date): топ-{@link PINNED_PROMO_COUNT} промо закреплены
 *   в начале (по промо-порядку), остальное — строго по ключу; закреплённые из
 *   потока исключены. Tie-break везде `id desc`.
 * - `price_*`: цена нормализуется в USD по курсу ЦБУ (`rate`), чтобы UZS/USD
 *   сравнивались по реальной стоимости; без курса — по сырой цене.
 * - `area_*`: пустая/NULL площадь — в конец потока.
 *
 * Клиент получает `effective_tier` (промо уже с учётом истечения) → `promo`,
 * поэтому отдельная обработка expiry не нужна.
 */
import { convertPrice } from './format';
import type { Listing, PromotionType, SortOption } from './mock/types';

/** Кол-во закреплённых промо в начале явной сортировки (зеркало бэкенда). */
export const PINNED_PROMO_COUNT = 3;

/** Числовой ранг промо-тира: VIP=2, TOP=1, NORMAL=0. */
function tierRank(promo: PromotionType): number {
  return promo === 'VIP' ? 2 : promo === 'TOP' ? 1 : 0;
}

/** Timestamp из ISO-строки (NaN → 0, чтобы не ломать сравнение). */
function ts(iso: string): number {
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : 0;
}

/** id по убыванию (паритет с `ORDER BY … id DESC` на бэке). */
function cmpIdDesc(a: Listing, b: Listing): number {
  return b.id.localeCompare(a.id);
}

/** Промо-порядок: tier desc → createdAt desc → id desc. */
function cmpPromo(a: Listing, b: Listing): number {
  return (
    tierRank(b.promo) - tierRank(a.promo) ||
    ts(b.createdAt) - ts(a.createdAt) ||
    cmpIdDesc(a, b)
  );
}

/** Цена, нормализованная в USD (без курса — сырое число). */
function priceUsd(l: Listing, rate?: number): number {
  const raw = Number(l.price);
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return raw;
  return convertPrice(raw, l.currency, 'USD', rate);
}

/** Площадь как число; пусто/NULL/NaN → null (уходит в конец потока). */
function areaVal(l: Listing): number | null {
  if (l.area == null || l.area === '') return null;
  const n = Number(l.area);
  return Number.isFinite(n) ? n : null;
}

/** Компаратор потока (не-закреплённой части) по выбранному ключу. */
function streamComparator(
  sort: SortOption,
  rate?: number,
): (a: Listing, b: Listing) => number {
  switch (sort) {
    case 'price_asc':
    case 'price_desc': {
      const dir = sort === 'price_asc' ? 1 : -1;
      return (a, b) => (priceUsd(a, rate) - priceUsd(b, rate)) * dir || cmpIdDesc(a, b);
    }
    case 'area_asc':
    case 'area_desc': {
      const dir = sort === 'area_asc' ? 1 : -1;
      return (a, b) => {
        const av = areaVal(a);
        const bv = areaVal(b);
        // NULL-площадь всегда в конец — независимо от направления.
        if (av == null && bv == null) return cmpIdDesc(a, b);
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir || cmpIdDesc(a, b);
      };
    }
    case 'date_desc':
    default:
      return (a, b) => ts(b.createdAt) - ts(a.createdAt) || cmpIdDesc(a, b);
  }
}

/**
 * Отсортировать загруженную выдачу под выбранный сорт. Возвращает НОВЫЙ массив
 * (исходный не мутируется). `rate` — курс 1 USD = rate UZS (для price_*).
 */
export function sortListings(
  list: Listing[],
  sort: SortOption,
  rate?: number,
): Listing[] {
  const arr = [...list];

  // Дефолт: полный промо-приоритет, без закрепления/потока.
  if (sort === 'promotion') return arr.sort(cmpPromo);

  // Явный сорт: закрепляем топ-N промо, остальное — строго по ключу.
  const pinned = arr
    .filter((l) => tierRank(l.promo) > 0)
    .sort(cmpPromo)
    .slice(0, PINNED_PROMO_COUNT);
  const pinnedIds = new Set(pinned.map((l) => l.id));
  const stream = arr
    .filter((l) => !pinnedIds.has(l.id))
    .sort(streamComparator(sort, rate));

  return [...pinned, ...stream];
}
