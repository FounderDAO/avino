/**
 * address-format — чистые функции формата адреса объявления (ADR-0147).
 *
 * Канонический формат: `{locality}, {district}, {street}, {house}` — без страны,
 * без «город », без дублей района/города в хвосте. Используются AddressResolverService
 * (структурные компоненты Yandex HTTP Geocoder) и строковым фолбэком в ListingsService.
 */

export interface AddressParts {
  locality?: string | null;
  district?: string | null;
  street?: string | null;
  house?: string | null;
}

export interface GeoParts {
  locality: string | null;
  street: string | null;
  house: string | null;
}

/** Страны, выбрасываемые нормализатором (ru/en/uz-latin написания). */
const COUNTRY_PARTS = new Set(['узбекистан', 'uzbekistan', "o'zbekiston", 'ozbekiston', 'oʻzbekiston']);

const RU_STREET_ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/^улица\s+/i, 'ул. '],
  [/^проспект\s+/i, 'просп. '],
  [/^переулок\s+/i, 'пер. '],
  [/^бульвар\s+/i, 'бул. '],
  [/^площадь\s+/i, 'пл. '],
];

/** «город Ташкент» / «г. Ташкент» → «Ташкент». */
export function stripCityPrefix(name: string): string {
  return name.replace(/^(город|г\.)\s+/i, '').trim();
}

/** «улица Сеул» → «ул. Сеул»; уже сокращённое и не-русское — как есть. */
export function abbreviateStreetRu(street: string): string {
  for (const [pattern, abbr] of RU_STREET_ABBREVIATIONS) {
    if (pattern.test(street)) {
      return street.replace(pattern, abbr);
    }
  }
  return street;
}

/** Склейка непустых частей канонического формата через ', '. */
export function formatAddress(parts: AddressParts): string {
  return [parts.locality, parts.district, parts.street, parts.house]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Ключ сравнения части адреса для дедупа: lower, ё→е, без хвостов
 * « р-н»/« район»/« district» и суффикса «ский» («Мирзо-Улугбекский район» ≈
 * «Мирзо-Улугбек р-н» ≈ «Мирзо-Улугбек»).
 */
function canonPart(part: string): string {
  return part
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+(р-н|район|district)$/i, '')
    .replace(/ский$/i, '')
    .trim();
}

/**
 * Строковый фолбэк-нормализатор: чистит присланную строку адреса, когда
 * геокодер недоступен. Выбрасывает страну, срезает «город »-префиксы,
 * сокращает «улица …», выбрасывает части-дубли (хвост «…р-н, Ташкент»
 * от Yandex Suggest displayName). Идемпотентен.
 */
export function normalizeAddress(raw: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const rawPart of raw.split(',')) {
    let part = rawPart.trim();
    if (!part) continue;
    if (COUNTRY_PARTS.has(part.toLowerCase())) continue;
    part = abbreviateStreetRu(stripCityPrefix(part));
    const key = canonPart(part);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.join(', ');
}

/** Компонент структурного адреса в ответе HTTP Геокодера. */
interface GeocoderComponent {
  kind?: unknown;
  name?: unknown;
}

/** Разобранный первый объект ответа геокодера: части адреса + все компоненты + точка объекта. */
export interface GeoObjectParts extends GeoParts {
  components: Array<{ kind: string; name: string }>;
  /** `GeocoderMetaData.kind` объекта (house / street / district / locality …). */
  kind: string | null;
  /** Координаты найденного объекта (`Point.pos` = "lng lat"). */
  point: { lat: number; lng: number } | null;
}

/**
 * Первый объект ответа Yandex HTTP Geocoder: структурные компоненты
 * (`GeoObject.metaDataProperty.GeocoderMetaData.Address.Components`), kind и
 * точка объекта. Нет компонентов → null.
 */
export function extractGeoObject(json: unknown): GeoObjectParts | null {
  const geoObject = (json as {
    response?: {
      GeoObjectCollection?: {
        featureMember?: Array<{
          GeoObject?: {
            metaDataProperty?: {
              GeocoderMetaData?: { kind?: unknown; Address?: { Components?: unknown } };
            };
            Point?: { pos?: unknown };
          };
        }>;
      };
    };
  })?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  const meta = geoObject?.metaDataProperty?.GeocoderMetaData;
  const raw = meta?.Address?.Components;
  if (!Array.isArray(raw)) {
    return null;
  }
  const components = (raw as GeocoderComponent[])
    .filter((c) => typeof c.kind === 'string' && typeof c.name === 'string')
    .map((c) => ({ kind: c.kind as string, name: c.name as string }));
  const names = (kind: string): string[] => components.filter((c) => c.kind === kind).map((c) => c.name);
  // .at(-1): у kind=district их несколько (район + махалля) — берём НЕ их;
  // locality обычно один, для province последний — самый специфичный.
  const locality = names('locality').at(-1) ?? names('province').at(-1) ?? null;
  let point: GeoObjectParts['point'] = null;
  if (typeof geoObject?.Point?.pos === 'string') {
    const [lng, lat] = geoObject.Point.pos.trim().split(/\s+/).map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) point = { lat, lng };
  }
  return {
    locality,
    street: names('street').at(-1) ?? null,
    house: names('house').at(-1) ?? null,
    components,
    kind: typeof meta?.kind === 'string' ? meta.kind : null,
    point,
  };
}

/**
 * Достаёт locality/street/house из ответа Yandex HTTP Geocoder
 * (`GeoObject.metaDataProperty.GeocoderMetaData.Address.Components`).
 * Нет компонентов → null (вызывающий уходит в строковый фолбэк).
 */
export function extractGeoParts(json: unknown): GeoParts | null {
  const parsed = extractGeoObject(json);
  return parsed ? { locality: parsed.locality, street: parsed.street, house: parsed.house } : null;
}

/** Расстояние между точками в метрах (гаверсинус; для «дом у точки или в стороне»). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
