/**
 * Страница поиска /search — server component.
 *
 * Читает фильтры из URL (searchParams), вызывает мок-селектор getListings и
 * рендерит: FilterBar (sticky, client) сверху + SearchResults (список/карта).
 * Фильтры — единственный источник истины в URL, поэтому страница
 * пересобирается при каждом изменении query (FilterBar → router.replace).
 *
 * SEO canonical (ADR-0104):
 * - Сохраняем только семантические параметры (tx, type, district_id).
 * - Дроп: view, sort, cursor, priceMin/priceMax/rooms (длиннохвостые комбинации).
 * - Длиннохвостые URL (priceMin/priceMax/rooms) → robots: noindex.
 * - Базовые tx/type/district — индексируемые лендинги.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getDistricts } from '@/lib/api/geo';
import { searchListingsPage } from '@/lib/api/listings';
import type {
  ListingFilter,
  ParkingType,
  PropertyType,
  SortOption,
  TransactionType,
} from '@/lib/mock/types';
import { PARKING_TYPES } from '@/lib/mock/types';
import { FilterBar, type FilterValues } from '@/features/search/FilterBar';
import { SearchResults } from '@/features/search/SearchResults';
import { alternatesFor } from '@/lib/seo/alternates';
import { BASE } from '@/lib/seo/base';
import { routing } from '@/i18n/routing';

/** Семантические параметры поиска — остаются в canonical (формируют лендинги). */
const SEMANTIC_PARAMS = ['tx', 'type', 'district_id'] as const;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'search' });

  // Флаг «длиннохвостой» комбинации фильтров — цена, комнаты или расширенные фильтры.
  const isLongTail = Boolean(
    sp.priceMin || sp.priceMax || sp.rooms ||
    sp.rooms_min || sp.bathrooms_min || sp.area_min || sp.area_max ||
    sp.floor_min || sp.floor_max ||
    sp.total_floors_min || sp.total_floors_max ||
    sp.year_min || sp.year_max ||
    sp.lot_area_min || sp.lot_area_max ||
    sp.listing_source || sp.tours_enabled || sp.parking_type,
  );

  // Canonical: оставляем только семантические параметры (strip sort/view/cursor/price/rooms).
  const canonicalParams = new URLSearchParams();
  for (const key of SEMANTIC_PARAMS) {
    const val = Array.isArray(sp[key]) ? sp[key][0] : sp[key];
    if (val) canonicalParams.set(key, val);
  }
  const canonicalSuffix = canonicalParams.toString() ? `?${canonicalParams.toString()}` : '';
  const canonicalPath = `/search${canonicalSuffix}`;

  // alternatesFor строит canonical + hreflang; для поиска подставляем canonical-путь.
  const canonicalUrl = `${BASE}/${locale}${canonicalPath}`;
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${BASE}/${l}${canonicalPath}`;
  }
  languages['x-default'] = `${BASE}/${routing.defaultLocale}${canonicalPath}`;

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    // Длиннохвостые URL (цена + комнаты) — не индексируем, не дублируем контент.
    ...(isLongTail && { robots: { index: false, follow: true } }),
  };
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

  /** Парсит строку в число; undefined если нет или NaN. */
  function toNum(s: string | undefined): number | undefined {
    if (!s) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }

  const roomsRaw = Number(first(sp.rooms));
  const rooms = Number.isFinite(roomsRaw) && roomsRaw > 0 ? roomsRaw : undefined;

  const roomsMinParsed = toNum(first(sp.rooms_min));
  const roomsMin = roomsMinParsed !== undefined && roomsMinParsed > 0 ? roomsMinParsed : undefined;

  const bathroomsMinParsed = toNum(first(sp.bathrooms_min));
  const bathroomsMin = bathroomsMinParsed !== undefined && bathroomsMinParsed > 0 ? bathroomsMinParsed : undefined;

  const priceMinRaw = first(sp.priceMin);
  const priceMaxRaw = first(sp.priceMax);
  const priceMin = priceMinRaw && Number.isFinite(Number(priceMinRaw)) ? Number(priceMinRaw) : undefined;
  const priceMax = priceMaxRaw && Number.isFinite(Number(priceMaxRaw)) ? Number(priceMaxRaw) : undefined;

  // Мультивыбор типов жилья (?type= может повторяться).
  const rawTypes = Array.isArray(sp.type) ? sp.type : sp.type ? [sp.type] : [];
  const types = rawTypes.filter((t): t is PropertyType =>
    PROPERTY_TYPES.includes(t as PropertyType),
  );

  const rawParking = Array.isArray(sp.parking_type)
    ? sp.parking_type
    : sp.parking_type ? [sp.parking_type] : [];
  const parkingTypes = rawParking.filter((p): p is ParkingType =>
    PARKING_TYPES.includes(p as ParkingType),
  );

  // Строковые диапазоны (в FilterValues остаются строками, в ListingFilter → числа).
  const areaMinRaw = first(sp.area_min);
  const areaMaxRaw = first(sp.area_max);
  const lotAreaMinRaw = first(sp.lot_area_min);
  const lotAreaMaxRaw = first(sp.lot_area_max);
  const floorMinRaw = first(sp.floor_min);
  const floorMaxRaw = first(sp.floor_max);
  const totalFloorsMinRaw = first(sp.total_floors_min);
  const totalFloorsMaxRaw = first(sp.total_floors_max);
  const yearMinRaw = first(sp.year_min);
  const yearMaxRaw = first(sp.year_max);

  // Булевые флаги.
  const notFirstFloor = first(sp.not_first_floor) === 'true' ? true : undefined;
  const notLastFloor = first(sp.not_last_floor) === 'true' ? true : undefined;
  const toursEnabled = first(sp.tours_enabled) === 'true' ? true : undefined;

  // Источник объявления.
  const rawSource = first(sp.listing_source);
  const listingSource: 'OWNER' | 'AGENCY' | undefined =
    rawSource === 'OWNER' || rawSource === 'AGENCY' ? rawSource : undefined;

  // ----- Данные из реального API -----
  // Первая страница (limit=24) + meta (total/next_cursor): курсор прокидываем в
  // клиентскую дозагрузку «Показать ещё» (TASK-199).
  const filter: ListingFilter = {
    tx,
    type,
    types: types.length > 0 ? types : undefined,
    districtId,
    roomsExact: rooms,
    roomsMin,
    bathroomsMin,
    priceMin,
    priceMax,
    query,
    sort,
    areaMin: toNum(areaMinRaw),
    areaMax: toNum(areaMaxRaw),
    lotAreaMin: toNum(lotAreaMinRaw),
    lotAreaMax: toNum(lotAreaMaxRaw),
    floorMin: toNum(floorMinRaw),
    floorMax: toNum(floorMaxRaw),
    totalFloorsMin: toNum(totalFloorsMinRaw),
    totalFloorsMax: toNum(totalFloorsMaxRaw),
    yearMin: toNum(yearMinRaw),
    yearMax: toNum(yearMaxRaw),
    notFirstFloor,
    notLastFloor,
    toursEnabled,
    listingSource,
    parkingTypes: parkingTypes.length > 0 ? parkingTypes : undefined,
  };
  const [page, districts] = await Promise.all([
    searchListingsPage(filter, locale),
    getDistricts(locale),
  ]);

  // Значения для FilterBar (цена и диапазоны — строкой, как в инпутах).
  const filterValues: FilterValues = {
    tx,
    type,
    types: types.length > 0 ? types : undefined,
    districtId,
    rooms,
    roomsMin,
    bathroomsMin,
    priceMin: priceMinRaw,
    priceMax: priceMaxRaw,
    query,
    sort,
    view,
    areaMin: areaMinRaw,
    areaMax: areaMaxRaw,
    lotAreaMin: lotAreaMinRaw,
    lotAreaMax: lotAreaMaxRaw,
    floorMin: floorMinRaw,
    floorMax: floorMaxRaw,
    totalFloorsMin: totalFloorsMinRaw,
    totalFloorsMax: totalFloorsMaxRaw,
    yearMin: yearMinRaw,
    yearMax: yearMaxRaw,
    notFirstFloor,
    notLastFloor,
    toursEnabled,
    listingSource,
    parkingTypes: parkingTypes.length > 0 ? parkingTypes : undefined,
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
