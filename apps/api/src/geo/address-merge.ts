/**
 * address-merge — итоговый адрес объявления из того, что ввёл пользователь, и
 * того, что геокодер знает о точке (ADR-0147, правка 2026-10-23).
 *
 * Правила:
 *  - адрес, который пользователь ввёл/выбрал, НЕ заменяется ближайшим домом
 *    Яндекса (для новостроек и на стыке участков это чужой дом/номер);
 *  - номер дома пользователя всегда главнее номера геокодера;
 *  - геокодер только дополняет недостающее (улица/дом, если их нет) и даёт
 *    en-версию — и только когда все части адреса пользователя ему известны;
 *  - номер дома от геокодера берётся, только если дом действительно у точки
 *    (`houseTrusted`), иначе адрес — до улицы;
 *  - район в собранном адресе — тот, в который попадает точка (справочник).
 */
import { abbreviateStreetRu, formatAddress, normalizeAddress, stripCityPrefix } from './address-format';
import { normalizeGeoName, type GeoComponent } from './geo-match';

/** Разобранный ответ геокодера на одном языке. */
export interface PointGeoParts {
  locality: string | null;
  street: string | null;
  house: string | null;
  components: GeoComponent[];
}

/** Что известно о точке: ru/en-ответы геокодера и район справочника. */
export interface PointAddress {
  ru: PointGeoParts;
  en: PointGeoParts | null;
  /** Дом из ответа стоит у самой точки (а не «ближайший» в стороне). */
  houseTrusted: boolean;
  /** Район справочника, в который попадает точка (или null). */
  district: { nameRu: string; nameEn: string; nameUz: string } | null;
}

export interface MergedAddress {
  address: string | null;
  addressEn: string | null;
}

const STREET_TYPE_WORDS = new Set([
  'улица',
  'ул',
  'проспект',
  'просп',
  'пр-т',
  'переулок',
  'пер',
  'бульвар',
  'бул',
  'площадь',
  'пл',
  'проезд',
  'тупик',
  'шоссе',
  'кўчаси',
  'кучаси',
  'kochasi',
  'street',
  'st',
  'avenue',
  'ave',
]);

/** Ключ сравнения улицы: без типа («улица»/«ул.»/«koʻchasi»), регистра, ё и апострофов. */
export function streetKey(street: string): string {
  return street
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ʻʼ‘’`´']/g, '')
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w && !STREET_TYPE_WORDS.has(w))
    .join(' ');
}

/** Часть адреса — номер дома? («13», «7/1», «13А», «д. 15», «дом 2Б») → номер или null. */
export function houseNumberOf(part: string): string | null {
  const value = part.trim().replace(/^(дом|д\.|д|uy|house)\s*/i, '');
  return /^\d+[\p{L}]?([/-]\d+[\p{L}]?)?$/u.test(value) ? value : null;
}

/**
 * Собирает ru/en адрес. `userAddress` — то, что прислал клиент (undefined/пусто —
 * адреса нет, собираем по точке).
 */
export function mergeListingAddress(userAddress: string | undefined, point: PointAddress): MergedAddress {
  const { ru, en, district } = point;
  const geoHouseRu = point.houseTrusted ? ru.house : null;
  const geoHouseEn = point.houseTrusted ? (en?.house ?? null) : null;

  const build = (includeStreet: boolean, houseRu: string | null, houseEn: string | null): MergedAddress => {
    const address = formatAddress({
      locality: ru.locality ? stripCityPrefix(ru.locality) : null,
      district: district?.nameRu ?? null,
      street: includeStreet && ru.street ? abbreviateStreetRu(ru.street) : null,
      house: houseRu,
    });
    const addressEn = en
      ? formatAddress({
          locality: en.locality,
          district: district?.nameEn ?? null,
          street: includeStreet ? en.street : null,
          house: houseEn,
        })
      : '';
    return { address: address || null, addressEn: addressEn || null };
  };

  const normalized = userAddress ? normalizeAddress(userAddress) : '';
  if (!normalized) {
    return build(true, geoHouseRu, geoHouseEn);
  }

  // Какие названия геокодер знает про точку: город/регион/районы/махалли + наш район.
  const placeKeys = new Set(
    [
      ru.locality,
      ...ru.components
        .filter((c) => ['province', 'area', 'locality', 'district'].includes(c.kind))
        .map((c) => c.name),
      district?.nameRu,
      district?.nameUz,
      district?.nameEn,
    ]
      .filter((n): n is string => Boolean(n))
      .map(normalizeGeoName)
      .filter(Boolean),
  );
  const geoStreet = ru.street ? streetKey(ru.street) : null;

  const parts = normalized.split(', ');
  const lastHouse = houseNumberOf(parts[parts.length - 1]);
  const userHouse = parts.length > 1 ? lastHouse : null;
  const named = userHouse ? parts.slice(0, -1) : parts;
  let streetMentioned = false;
  for (const part of named) {
    if (geoStreet && streetKey(part) === geoStreet) {
      streetMentioned = true;
      continue;
    }
    if (placeKeys.has(normalizeGeoName(part))) continue;
    // Часть, которой геокодер не знает (другая улица, ЖК, ориентир) — адрес
    // пользователя остаётся как есть; en-версию не выдумываем.
    return { address: normalized, addressEn: null };
  }

  // Номер дома пользователя главнее; без номера — дом геокодера (если он у точки).
  // Дом указан без улицы — улицу не подставляем: она может оказаться чужой.
  const includeStreet = streetMentioned || !userHouse;
  return build(includeStreet, userHouse ?? geoHouseRu, userHouse ?? geoHouseEn);
}
