/**
 * geo-match — сопоставление компонент адреса Yandex-геокодера со справочником
 * «Регион → Район» (таблицы regions / districts). ЧИСТЫЕ функции: без БД и сети.
 *
 * Серверная копия алгоритма клиентского apps/client/src/features/map/geoMatch.ts
 * (визард выставляет район по клику на карте) — чтобы район по точке на сервере
 * (создание/правка/импорт объявления, backfill) определялся ТЕМ ЖЕ правилом,
 * что и в визарде. Меняете правило — меняйте в обоих местах.
 *
 * Почему через геокодер, а не PostGIS: у regions/districts в схеме нет ни
 * полигонов, ни центроидов (ADR-0068, ADR-0113) — ST_Contains/ближайший
 * центроид сделать не на чем. Компоненты Yandex по точке — единственный
 * доступный источник административной принадлежности.
 *
 * Квирки справочника:
 *  - «город Ташкент» и «Ташкентская область» различаем по ТИПУ (город/область);
 *  - районы Ташкента без суффикса («Юнусабад»), у Yandex — прилагательные
 *    («Юнусабадский район») → второй проход по основе слова;
 *  - «Самаркандский район» и город «Самарканд» → точное совпадение приоритетнее;
 *  - латинская «p» в русских названиях («Чиpчик»).
 */

/** Компонента адреса Yandex (`GeocoderMetaData.Address.Components[]`). */
export interface GeoComponent {
  kind: string;
  name: string;
}

/** Регион справочника: все его названия (uz/ru/en). */
export interface DirectoryRegion {
  id: string;
  code: string;
  names: string[];
}

/** Район справочника: все его названия (uz/ru/en) и родительский регион. */
export interface DirectoryDistrict {
  id: string;
  regionId: string | null;
  names: string[];
}

export interface GeoMatch {
  regionId?: string;
  districtId?: string;
}

type UnitKind = 'city' | 'region' | 'republic' | 'plain';

const APOSTROPHES = /[ʻʼ‘’`´']/g;

/** Латинские гомоглифы внутри кириллического слова («Чиpчик» → «Чирчик»). */
const HOMOGLYPHS: Record<string, string> = {
  a: 'а',
  c: 'с',
  e: 'е',
  o: 'о',
  p: 'р',
  x: 'х',
  y: 'у',
  k: 'к',
  m: 'м',
  t: 'т',
  h: 'н',
  b: 'в',
};

const CITY_WORDS = new Set(['город', 'г', 'shahri', 'shahar', 'city']);
const REGION_WORDS = new Set(['область', 'обл', 'viloyati', 'viloyat', 'region', 'oblast', 'province']);
const REPUBLIC_WORDS = new Set(['республика', 'respublikasi', 'respublika', 'republic']);
const DISTRICT_WORDS = new Set(['район', 'рн', 'tumani', 'tuman', 'district', 'of']);

function normalizeToken(raw: string): string {
  const t = raw.replace(/ё/g, 'е');
  if (!/[а-я]/.test(t)) return t;
  return t.replace(/[a-z]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
}

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/р-н/g, 'рн')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(normalizeToken);
}

function analyze(name: string): { key: string; kind: UnitKind } {
  let kind: UnitKind = 'plain';
  const rest: string[] = [];
  for (const tok of tokenize(name)) {
    if (CITY_WORDS.has(tok)) kind = 'city';
    else if (REGION_WORDS.has(tok)) kind = 'region';
    else if (REPUBLIC_WORDS.has(tok)) kind = 'republic';
    else if (!DISTRICT_WORDS.has(tok)) rest.push(tok);
  }
  return { key: rest.join(' '), kind };
}

/** Ключ сравнения географического названия (регистр, ё, апострофы, служебные слова). */
export function normalizeGeoName(name: string): string {
  return analyze(name).key;
}

/** Основа: без «-ский/-цкий» и хвостовых гласных; `dropIn` снимает «-ин-» («Учтепинский» ≈ «Учтепа»). */
function stemKey(key: string, dropIn: boolean): string {
  let s = key.replace(/(ск|цк)(ий|ая|ое|ой)$/, '');
  if (dropIn && s !== key) s = s.replace(/ин$/, '');
  return s.replace(/[аеиоуыэюяй]+$/, '');
}

function stemKeys(key: string): string[] {
  return [...new Set([stemKey(key, false), stemKey(key, true)])].filter((s) => s.length >= 3);
}

/** Синонимы регионов по `code` (en-названия Yandex; в справочнике name_en = узб. латиница). */
const REGION_SYNONYMS: Record<string, string[]> = {
  'toshkent-shahri': ['город Ташкент', 'Toshkent shahri', 'Tashkent city'],
  toshkent: ['Ташкентская область', 'Toshkent viloyati', 'Tashkent Region'],
  andijon: ['Андижанская область', 'Andijon viloyati', 'Andijan Region'],
  buxoro: ['Бухарская область', 'Buxoro viloyati', 'Bukhara Region'],
  jizzax: ['Джизакская область', 'Jizzax viloyati', 'Jizzakh Region'],
  qashqadaryo: ['Кашкадарьинская область', 'Qashqadaryo viloyati', 'Kashkadarya Region'],
  navoiy: ['Навоийская область', 'Navoiy viloyati', 'Navoi Region'],
  namangan: ['Наманганская область', 'Namangan viloyati', 'Namangan Region'],
  qoraqalpogiston: ['Республика Каракалпакстан', 'Qoraqalpogʻiston Respublikasi', 'Republic of Karakalpakstan'],
  samarqand: ['Самаркандская область', 'Samarqand viloyati', 'Samarkand Region'],
  surxondaryo: ['Сурхандарьинская область', 'Surxondaryo viloyati', 'Surkhandarya Region'],
  sirdaryo: ['Сырдарьинская область', 'Sirdaryo viloyati', 'Syrdarya Region'],
  fargona: ['Ферганская область', 'Fargʻona viloyati', 'Fergana Region'],
  xorazm: ['Хорезмская область', 'Xorazm viloyati', 'Khorezm Region'],
};

/** Совместимость типов: 3 — тот же; 2 — без уточнения ↔ город; 1 — без уточнения ↔ область; 0 — нет. */
function kindScore(form: UnitKind, comp: UnitKind): number {
  if (form === comp) return 3;
  if (form === 'plain' || comp === 'plain') {
    const other = form === 'plain' ? comp : form;
    return other === 'city' ? 2 : 1;
  }
  return 0;
}

function matchRegionByName(name: string, regions: DirectoryRegion[], minScore: number): string | undefined {
  const comp = analyze(name);
  if (!comp.key) return undefined;
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const r of regions) {
    const forms = [...r.names, ...(REGION_SYNONYMS[r.code] ?? [])];
    let score = 0;
    for (const f of forms) {
      const a = analyze(f);
      if (a.key === comp.key) score = Math.max(score, kindScore(a.kind, comp.kind));
    }
    if (score < minScore || score === 0) continue;
    if (!best || score > best.score) {
      best = { id: r.id, score };
      tie = false;
    } else if (score === best.score && r.id !== best.id) {
      tie = true;
    }
  }
  return best && !tie ? best.id : undefined;
}

function districtKeys(d: DirectoryDistrict): string[] {
  return d.names.map(normalizeGeoName).filter(Boolean);
}

/** Сначала точное совпадение по всем компонентам, потом по основе; неоднозначная основа — не принимаем. */
function matchDistrict(names: string[], pool: DirectoryDistrict[]): string | undefined {
  const keyed = pool.map((d) => ({ id: d.id, keys: districtKeys(d) }));
  const comps = names.map(normalizeGeoName).filter(Boolean);
  for (const comp of comps) {
    const hit = keyed.find((d) => d.keys.includes(comp));
    if (hit) return hit.id;
  }
  for (const comp of comps) {
    const stems = stemKeys(comp);
    const hits = keyed.filter((d) => d.keys.some((k) => stemKeys(k).some((s) => stems.includes(s))));
    if (hits.length === 1) return hits[0].id;
  }
  return undefined;
}

/**
 * Компоненты адреса Yandex → регион и район справочника.
 *
 * Регион — по `province` (у г. Ташкент Yandex отдаёт province «Ташкент»), затем
 * по `locality`, но только как город. Район — ТОЛЬКО среди районов найденного
 * региона, по компонентам area → district → locality (города областного
 * подчинения в справочнике — тоже «районы»). Регион не распознан — район только
 * точным и однозначным совпадением по всему справочнику.
 */
export function matchRegionDistrict(
  components: GeoComponent[],
  regions: DirectoryRegion[],
  districts: DirectoryDistrict[],
): GeoMatch {
  const byKind = (kind: string) => components.filter((cmp) => cmp.kind === kind && cmp.name).map((cmp) => cmp.name);

  let regionId: string | undefined;
  for (const name of byKind('province').reverse()) {
    regionId = matchRegionByName(name, regions, 1);
    if (regionId) break;
  }
  if (!regionId) {
    for (const name of byKind('locality')) {
      regionId = matchRegionByName(name, regions, 2);
      if (regionId) break;
    }
  }

  const districtNames = [...byKind('area'), ...byKind('district'), ...byKind('locality')];

  if (regionId) {
    const pool = districts.filter((d) => d.regionId === regionId);
    return { regionId, districtId: matchDistrict(districtNames, pool) };
  }

  const comps = districtNames.map(normalizeGeoName).filter(Boolean);
  for (const comp of comps) {
    const hits = districts.filter((d) => d.regionId && districtKeys(d).includes(comp));
    if (hits.length === 1) {
      return { regionId: hits[0].regionId as string, districtId: hits[0].id };
    }
  }
  return {};
}
