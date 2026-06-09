/**
 * Страница поиска /search — server component.
 *
 * Читает фильтры из URL (searchParams), вызывает мок-селектор getListings и
 * рендерит: FilterBar (sticky, client) сверху + SearchResults (список/карта).
 * Фильтры — единственный источник истины в URL, поэтому страница
 * пересобирается при каждом изменении query (FilterBar → router.replace).
 */
import { getListings, getDistricts } from '@/lib/mock';
import type {
  ListingFilter,
  PropertyType,
  SortOption,
  TransactionType,
} from '@/lib/mock/types';
import { FilterBar, type FilterValues } from '@/features/search/FilterBar';
import { SearchResults } from '@/features/search/SearchResults';

export const metadata = {
  title: 'Поиск недвижимости — Avino',
  description: 'Покупка и аренда жилья в Узбекистане: фильтры, список и карта.',
};

/** Допустимые значения, чтобы безопасно сузить строки из URL. */
const PROPERTY_TYPES: PropertyType[] = [
  'APARTMENT',
  'HOUSE',
  'NEW_BUILDING',
  'LAND',
  'COMMERCIAL',
];
const SORT_OPTIONS: SortOption[] = [
  'promotion',
  'price_asc',
  'price_desc',
  'date_desc',
  'area_asc',
  'area_desc',
];

/** Достаёт первое значение query-параметра (Next отдаёт string | string[]). */
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** searchParams в Next 15 — Promise. */
type SearchParams = Record<string, string | string[] | undefined>;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  // ----- Парсинг и нормализация фильтров из URL -----
  const tx: TransactionType = first(sp.tx) === 'RENT' ? 'RENT' : 'SALE';

  const rawType = first(sp.type);
  const type = PROPERTY_TYPES.includes(rawType as PropertyType)
    ? (rawType as PropertyType)
    : undefined;

  const rawSort = first(sp.sort);
  const sort: SortOption = SORT_OPTIONS.includes(rawSort as SortOption)
    ? (rawSort as SortOption)
    : 'promotion';

  const district = first(sp.district) || undefined;
  const query = first(sp.query) || undefined;
  const view: 'list' | 'map' = first(sp.view) === 'map' ? 'map' : 'list';

  const roomsRaw = Number(first(sp.rooms));
  const rooms = Number.isFinite(roomsRaw) && roomsRaw > 0 ? roomsRaw : undefined;

  const priceMinRaw = first(sp.priceMin);
  const priceMaxRaw = first(sp.priceMax);
  const priceMin = priceMinRaw && Number.isFinite(Number(priceMinRaw)) ? Number(priceMinRaw) : undefined;
  const priceMax = priceMaxRaw && Number.isFinite(Number(priceMaxRaw)) ? Number(priceMaxRaw) : undefined;

  // ----- Данные из моков -----
  const filter: ListingFilter = { tx, type, district, rooms, priceMin, priceMax, query, sort };
  const listings = getListings(filter);
  const districts = getDistricts();

  // Значения для FilterBar (цена — строкой, как в инпутах).
  const filterValues: FilterValues = {
    tx,
    type,
    district,
    rooms,
    priceMin: priceMinRaw,
    priceMax: priceMaxRaw,
    query,
    sort,
    view,
  };

  // Заголовок выдачи: «Покупка/Аренда жилья · <запрос|Ташкент>».
  const heading = `${tx === 'RENT' ? 'Аренда' : 'Покупка'} жилья · ${query || 'Ташкент'}`;

  return (
    <div className="fade-up">
      <FilterBar values={filterValues} districts={districts} />
      <SearchResults listings={listings} view={view} heading={heading} />
    </div>
  );
}
