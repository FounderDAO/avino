/**
 * SEO-хелперы страницы поиска: заголовок/описание лендинга и canonical.
 *
 * Раньше все URL /search отдавали один и тот же <title> («Поиск недвижимости»),
 * а H1 не учитывал тип жилья. Теперь H1 и <title> строятся одной функцией из
 * сделки, типа, «новостроек» и локации: «Аренда домов · Ташкент».
 */
import type { PropertyType, TransactionType } from '@/lib/mock/types';
import type { T } from '@/lib/format';
import { parsePageParam } from './pagination';

const PROPERTY_TYPES: PropertyType[] = ['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL'];

export interface SearchHeadingInput {
  tx: TransactionType;
  /** Типы из URL (уже провалидированные). Ровно один — уточняет заголовок. */
  types?: PropertyType[];
  newConstruction?: boolean;
  districtName?: string;
  regionName?: string;
  /** Свободный текстовый запрос. */
  query?: string;
  /** Имя агента, если выдача — объявления одного агента. */
  agentName?: string;
  /** Переводчик неймспейса `search`. */
  t: T;
}

/** Ключ «предмета» выдачи: ALL / APARTMENT / … / NEW. */
export function searchSubjectKey(types: PropertyType[] | undefined, newConstruction?: boolean): string {
  if (newConstruction) return 'NEW';
  if (types && types.length === 1) return types[0];
  return 'ALL';
}

export interface SearchHeading {
  heading: string;
  description: string;
  /** «Продажа домов» и «Ташкент» — для вводного абзаца лендинга. */
  subject?: string;
  place?: string;
}

export function buildSearchHeading(input: SearchHeadingInput): SearchHeading {
  const { tx, types, newConstruction, districtName, regionName, query, agentName, t } = input;
  if (agentName) {
    const heading = t(tx === 'RENT' ? 'headingAgentRent' : 'headingAgentSale', { name: agentName });
    return { heading, description: t('landing.agentDescription', { heading }) };
  }
  const subject = t(`landing.subject.${tx}.${searchSubjectKey(types, newConstruction)}`);
  const place = districtName || regionName || query || t('defaultLocation');
  return {
    heading: t('landing.heading', { subject, place }),
    description: t('landing.description', { subject, place }),
    subject,
    place,
  };
}

// ─── Canonical ────────────────────────────────────────────────────────────────

type SP = Record<string, string | string[] | undefined>;

const all = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);
const first = (v: string | string[] | undefined): string | undefined => all(v)[0];

/** Параметры, которые меняют выдачу «в длинный хвост» — такие страницы не индексируем. */
const LONG_TAIL_PARAMS = [
  'sw_lat', 'points', 'priceMin', 'priceMax', 'rooms', 'rooms_min', 'bathrooms_min',
  'area_min', 'area_max', 'floor_min', 'floor_max', 'total_floors_min', 'total_floors_max',
  'year_min', 'year_max', 'lot_area_min', 'lot_area_max', 'listing_source', 'tours_enabled',
  'is_basement', 'parking_type', 'amenities', 'agent_id', 'include_closed',
  'not_first_floor', 'not_last_floor', 'price_reduced', 'sort',
] as const;

export interface SearchCanonical {
  /** Путь без локали, напр. `/search?tx=SALE&type=HOUSE`. null — страница не индексируется. */
  path: string | null;
  noindex: boolean;
}

/**
 * Канонический адрес лендинга поиска. Порядок параметров стабильный:
 * tx, type, new_construction, region_id, district_id, page (если > 1).
 * - без tx — tx=SALE (эффективный дефолт), чтобы /search и /search?tx=SALE совпадали;
 * - несколько type, свободный query, region_id=all, режим карты и длиннохвостые
 *   фильтры → noindex, follow (без canonical).
 */
export function buildSearchCanonical(sp: SP): SearchCanonical {
  const rawTypes = all(sp.type);
  const types = rawTypes.filter((v): v is PropertyType => PROPERTY_TYPES.includes(v as PropertyType));
  const newConstruction = first(sp.new_construction) === 'true' || rawTypes.includes('NEW_BUILDING');
  const regionId = first(sp.region_id);

  const noindex =
    LONG_TAIL_PARAMS.some((k) => Boolean(first(sp[k]))) ||
    types.length > 1 ||
    Boolean(first(sp.query)) ||
    regionId === 'all' ||
    first(sp.view) === 'map';
  if (noindex) return { path: null, noindex: true };

  const params = new URLSearchParams();
  params.set('tx', first(sp.tx) === 'RENT' ? 'RENT' : 'SALE');
  if (types.length === 1) params.set('type', types[0]);
  if (newConstruction) params.set('new_construction', 'true');
  if (regionId) params.set('region_id', regionId);
  const districtId = first(sp.district_id);
  if (districtId) params.set('district_id', districtId);
  // Страница 2+ канонична сама себе (у каждой свой набор объявлений).
  const page = parsePageParam(sp.page);
  if (page && page > 1) params.set('page', String(page));
  return { path: `/search?${params.toString()}`, noindex: false };
}
