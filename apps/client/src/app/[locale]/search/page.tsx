/**
 * Страница поиска /search — server component.
 *
 * Читает фильтры из URL (searchParams), вызывает мок-селектор getListings и
 * рендерит: FilterBar (sticky, client) сверху + SearchResults (список/карта).
 * Фильтры — единственный источник истины в URL, поэтому страница
 * пересобирается при каждом изменении query (FilterBar → router.replace).
 */
import { getTranslations } from 'next-intl/server';
import { getDistricts } from '@/lib/api/geo';
import { searchListingsPage } from '@/lib/api/listings';
import type {
  ListingFilter,
  PropertyType,
  SortOption,
  TransactionType,
} from '@/lib/mock/types';
import { FilterBar, type FilterValues } from '@/features/search/FilterBar';
import { SearchResults } from '@/features/search/SearchResults';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'search' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

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
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
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

  // Район теперь фильтруется по UUID (`?district_id=`, GET /search) — справочник
  // отдаёт id (ADR-0068). Имя для отображения резолвится в FilterBar по списку.
  const districtId = first(sp.district_id) || undefined;
  const query = first(sp.query) || undefined;
  const view: 'list' | 'map' = first(sp.view) === 'map' ? 'map' : 'list';

  const roomsRaw = Number(first(sp.rooms));
  const rooms = Number.isFinite(roomsRaw) && roomsRaw > 0 ? roomsRaw : undefined;

  const priceMinRaw = first(sp.priceMin);
  const priceMaxRaw = first(sp.priceMax);
  const priceMin = priceMinRaw && Number.isFinite(Number(priceMinRaw)) ? Number(priceMinRaw) : undefined;
  const priceMax = priceMaxRaw && Number.isFinite(Number(priceMaxRaw)) ? Number(priceMaxRaw) : undefined;

  // ----- Данные из реального API -----
  // Первая страница (limit=24) + meta (total/next_cursor): курсор прокидываем в
  // клиентскую дозагрузку «Показать ещё» (TASK-199).
  const filter: ListingFilter = { tx, type, districtId, rooms, priceMin, priceMax, query, sort };
  const [page, districts] = await Promise.all([
    searchListingsPage(filter, locale),
    getDistricts(locale),
  ]);

  // Значения для FilterBar (цена — строкой, как в инпутах).
  const filterValues: FilterValues = {
    tx,
    type,
    districtId,
    rooms,
    priceMin: priceMinRaw,
    priceMax: priceMaxRaw,
    query,
    sort,
    view,
  };

  // Заголовок выдачи: «Покупка/Аренда жилья · <запрос|Ташкент>».
  const t = await getTranslations({ locale, namespace: 'search' });
  const heading = t(tx === 'RENT' ? 'headingRent' : 'headingSale', {
    query: query || t('defaultLocation'),
  });

  return (
    <div className="fade-up">
      <FilterBar values={filterValues} districts={districts} />
      <SearchResults
        listings={page.listings}
        total={page.total}
        initialCursor={page.nextCursor}
        view={view}
        heading={heading}
        filter={filter}
      />
    </div>
  );
}
