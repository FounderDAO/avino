/**
 * geoMatch — сопоставление компонент адреса Yandex-геокодера со справочником
 * «Регион → Район» (GET /geo/regions, /geo/districts). ЧИСТЫЕ функции: без DOM,
 * без ymaps, без сети — покрыты юнит-тестами (geoMatch.test.ts).
 *
 * Зачем: клик по карте в визарде «Разместить объявление» должен выставить не
 * только адрес, но и регион/район. Yandex отдаёт названия в своей форме
 * («Ташкент», «Юнусабадский район»), справочник — в своей («город Ташкент»,
 * «Юнусабад» / «Toshkent shahri», «Yunusobod»), поэтому сравниваем после
 * нормализации.
 *
 * Квирки реального справочника (см. миграции add_districts / add_regions):
 *  - регион Ташкент: «город Ташкент» / «Toshkent shahri», рядом «Ташкентская
 *    область» / «Toshkent viloyati» — различаем по ТИПУ (город/область), а не
 *    по подстроке;
 *  - районы Ташкента без суффикса («Юнусабад»), у Yandex — прилагательные
 *    («Юнусабадский район») → второй проход по основе слова;
 *  - в области есть и «Самаркандский район», и город «Самарканд» → точное
 *    совпадение всегда приоритетнее совпадения по основе;
 *  - в русских названиях встречается латинская «p» вместо «р» («Чиpчик»).
 */
import type { District, Region } from '@/lib/mock/types';

/** Компонента адреса Yandex (`GeocoderMetaData.Address.Components[]`). */
export interface AddressComponent {
  /** country / province / area / locality / district / street / house … */
  kind: string;
  name: string;
}

/** Результат сопоставления: id из справочника (или undefined, если не нашли). */
export interface GeoMatch {
  regionId?: string;
  districtId?: string;
}

/** Тип административной единицы, вычитанный из служебных слов названия. */
type UnitKind = 'city' | 'region' | 'republic' | 'plain';

/** Все виды апострофов (o‘ / oʻ / o' / o’ / o` / o´) — убираем целиком. */
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
const REGION_WORDS = new Set([
  'область',
  'обл',
  'viloyati',
  'viloyat',
  'region',
  'oblast',
  'province',
]);
const REPUBLIC_WORDS = new Set([
  'республика',
  'respublikasi',
  'respublika',
  'republic',
]);
/** Служебные слова района + связки — в ключ сравнения не входят. */
const DISTRICT_WORDS = new Set([
  'район',
  'рн',
  'tumani',
  'tuman',
  'district',
  'of',
]);

/** Слово → строчные, ё→е, без апострофов, латинские гомоглифы → кириллица. */
function normalizeToken(raw: string): string {
  const t = raw.replace(/ё/g, 'е');
  if (!/[а-я]/.test(t)) return t;
  return t.replace(/[a-z]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
}

/** Разбивает название на нормализованные слова (служебные ещё не выброшены). */
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/р-н/g, 'рн')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(normalizeToken);
}

/** Название → ключ сравнения + тип единицы (город/область/республика). */
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

/**
 * Нормализация географического названия для сравнения: регистр, ё→е,
 * апострофы (o‘/oʻ/o'), дефис↔пробел, латинские гомоглифы в кириллице и
 * служебные слова («район», «tumani», «district», «область», «viloyati»,
 * «город», «shahri», «республика»…).
 */
export function normalizeGeoName(name: string): string {
  return analyze(name).key;
}

/**
 * Основа названия: снимает русское окончание прилагательного («-ский», «-цкий»)
 * и хвостовые гласные — чтобы «Юнусабадский» ≈ «Юнусабад», «Сергелийский» ≈
 * «Сергели», «Яккасарайский» ≈ «Яккасарай». `dropIn` дополнительно снимает
 * «-ин-» («Учтепинский» ≈ «Учтепа»).
 */
function stemKey(key: string, dropIn: boolean): string {
  let s = key.replace(/(ск|цк)(ий|ая|ое|ой)$/, '');
  if (dropIn && s !== key) s = s.replace(/ин$/, '');
  return s.replace(/[аеиоуыэюяй]+$/, '');
}

/** Варианты основы названия (с «-ин-» и без) — без пустых и слишком коротких. */
function stemKeys(key: string): string[] {
  return [...new Set([stemKey(key, false), stemKey(key, true)])].filter(
    (s) => s.length >= 3,
  );
}

/**
 * Синонимы регионов по стабильному `code` справочника: в `Region` приходит имя
 * только на языке интерфейса (+ aliases), а Yandex отвечает по-русски (ru/uz
 * интерфейс) или по-английски (en). Английских названий в справочнике нет
 * (name_en = узбекская латиница), поэтому держим их здесь.
 */
const REGION_SYNONYMS: Record<string, string[]> = {
  'toshkent-shahri': ['город Ташкент', 'Toshkent shahri', 'Tashkent city'],
  toshkent: ['Ташкентская область', 'Toshkent viloyati', 'Tashkent Region'],
  andijon: ['Андижанская область', 'Andijon viloyati', 'Andijan Region'],
  buxoro: ['Бухарская область', 'Buxoro viloyati', 'Bukhara Region'],
  jizzax: ['Джизакская область', 'Jizzax viloyati', 'Jizzakh Region'],
  qashqadaryo: [
    'Кашкадарьинская область',
    'Qashqadaryo viloyati',
    'Kashkadarya Region',
    'Qashqadaryo Region',
  ],
  navoiy: ['Навоийская область', 'Navoiy viloyati', 'Navoi Region', 'Navoiy Region'],
  namangan: ['Наманганская область', 'Namangan viloyati', 'Namangan Region'],
  qoraqalpogiston: [
    'Республика Каракалпакстан',
    'Qoraqalpogʻiston Respublikasi',
    'Republic of Karakalpakstan',
  ],
  samarqand: ['Самаркандская область', 'Samarqand viloyati', 'Samarkand Region'],
  surxondaryo: [
    'Сурхандарьинская область',
    'Surxondaryo viloyati',
    'Surkhandarya Region',
    'Surxondaryo Region',
  ],
  sirdaryo: [
    'Сырдарьинская область',
    'Sirdaryo viloyati',
    'Syrdarya Region',
    'Sirdaryo Region',
  ],
  fargona: [
    'Ферганская область',
    'Fargʻona viloyati',
    'Fergana Region',
    'Ferghana Region',
  ],
  xorazm: ['Хорезмская область', 'Xorazm viloyati', 'Khorezm Region', 'Xorazm Region'],
};

/**
 * Насколько тип единицы из справочника совместим с типом компоненты Yandex:
 * 3 — тот же тип; 2 — «Ташкент» без уточнения ↔ город; 1 — название без
 * уточнения ↔ область/республика; 0 — несовместимы (город ↔ область).
 */
function kindScore(form: UnitKind, comp: UnitKind): number {
  if (form === comp) return 3;
  if (form === 'plain' || comp === 'plain') {
    const other = form === 'plain' ? comp : form;
    return other === 'city' ? 2 : 1;
  }
  return 0;
}

/** Регион по одной компоненте: лучший по совместимости типа; ничья → не знаем. */
function matchRegionByName(
  name: string,
  regions: Region[],
  minScore: number,
): string | undefined {
  const comp = analyze(name);
  if (!comp.key) return undefined;
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const r of regions) {
    const forms = [r.name, ...(r.aliases ?? []), ...(REGION_SYNONYMS[r.code] ?? [])];
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

/** Ключи сравнения района: отображаемое имя + имена на других языках. */
function districtKeys(d: District): string[] {
  return [d.name, ...(d.aliases ?? [])].map(normalizeGeoName).filter(Boolean);
}

/**
 * Район по компонентам адреса среди `pool`. Два прохода: сначала ТОЧНОЕ
 * совпадение нормализованных названий (по всем компонентам), и только потом —
 * по основе слова. Неоднозначное совпадение по основе не принимаем.
 */
function matchDistrict(names: string[], pool: District[]): string | undefined {
  const keyed = pool.map((d) => ({ id: d.id, keys: districtKeys(d) }));
  const comps = names.map(normalizeGeoName).filter(Boolean);

  for (const c of comps) {
    const hit = keyed.find((d) => d.keys.includes(c));
    if (hit) return hit.id;
  }
  for (const c of comps) {
    const stems = stemKeys(c);
    const hits = keyed.filter((d) =>
      d.keys.some((k) => stemKeys(k).some((s) => stems.includes(s))),
    );
    if (hits.length === 1) return hits[0].id;
  }
  return undefined;
}

/**
 * Компоненты адреса Yandex → регион и район справочника.
 *
 * Регион ищем в `province` (у г. Ташкент Yandex отдаёт province «Ташкент»),
 * затем в `locality` — но там только как город («город Ташкент»), чтобы
 * «Самарканд» не превратился в регион по случайному совпадению. Район ищем
 * ТОЛЬКО среди районов найденного региона, в компонентах area → district →
 * locality (города областного подчинения в справочнике — тоже «районы»).
 * Если регион не определился, но район совпал точно и однозначно по всему
 * справочнику — берём регион этого района.
 */
export function matchRegionDistrict(
  components: AddressComponent[],
  regions: Region[],
  districts: District[],
): GeoMatch {
  const byKind = (kind: string) =>
    components.filter((c) => c.kind === kind && c.name).map((c) => c.name);

  let regionId: string | undefined;
  // Последняя province — самая точная (первая может быть округом/макрорегионом).
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

  const districtNames = [
    ...byKind('area'),
    ...byKind('district'),
    ...byKind('locality'),
  ];

  if (regionId) {
    const pool = districts.filter((d) => d.regionId === regionId);
    return { regionId, districtId: matchDistrict(districtNames, pool) };
  }

  // Регион не распознан: район — только точным и однозначным совпадением.
  const comps = districtNames.map(normalizeGeoName).filter(Boolean);
  for (const c of comps) {
    const hits = districts.filter(
      (d) => d.regionId && districtKeys(d).includes(c),
    );
    if (hits.length === 1) {
      return { regionId: hits[0].regionId, districtId: hits[0].id };
    }
  }
  return {};
}

/**
 * Что выставить в форме по результату карты, не ухудшая выбор пользователя.
 * `null` — ничего не менять.
 *  - регион не распознан → не трогаем;
 *  - распознаны регион и район → ставим оба;
 *  - регион тот же, район не распознан → текущий район сохраняем;
 *  - регион другой, район не распознан → ставим регион, район сбрасываем
 *    (старый район не принадлежит новому региону).
 */
export function resolveMapLocation(
  current: { regionId?: string; districtId?: string },
  match: GeoMatch,
): { regionId: string; districtId?: string } | null {
  if (!match.regionId) return null;
  const curRegion = current.regionId || undefined;
  const curDistrict = current.districtId || undefined;
  if (match.districtId) {
    if (match.regionId === curRegion && match.districtId === curDistrict) {
      return null;
    }
    return { regionId: match.regionId, districtId: match.districtId };
  }
  if (match.regionId === curRegion) return null;
  return { regionId: match.regionId, districtId: undefined };
}

/** Автоадрес «{Регион}, {Район}» (или только регион; пусто — если нет региона). */
export function composeAutoAddress(
  regionName?: string,
  districtName?: string,
): string {
  if (!regionName) return '';
  return districtName ? `${regionName}, ${districtName}` : regionName;
}
