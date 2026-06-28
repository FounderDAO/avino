/**
 * Серверный слой гео-справочников (реальный NestJS API).
 *
 * Вызывается ТОЛЬКО из server components (search/page.tsx, home/Districts) и
 * приводит snake_case-ответ `/api/v1/geo/districts` к UI-типу {@link District}.
 * Заменяет мок-селектор `getDistricts` из `lib/mock` (тот же контракт без `count`
 * — справочник районов не агрегирует объявления; счётчик объявлений у эндпоинта
 * отсутствует, поэтому из UI он убран).
 *
 * Эндпоинт (API.md §geo, ADR-0068):
 *  - GET /api/v1/geo/districts — публичный список районов (auth: public).
 *    Ответ: `[{ id, code, name_uz, name_ru, name_en }]`, сортировка по name_ru.
 *
 * Имя района выбирается по языку интерфейса (Accept-Language), остальные языки
 * становятся `aliases` — чтобы подсказки поиска находили район по латинице
 * («yunusobod», «chilonzor»), как раньше делал мок (см. useGeoSuggest).
 */
import type { District, Region } from '@/lib/mock/types';
import { resolveApiBase } from './base';

/** Строка справочника районов GET /geo/districts (snake_case контракт §geo). */
export interface ApiDistrict {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
  region_id: string | null;
}

/** Имя района по языку интерфейса: `uz→name_uz`, `en→name_en`, иначе name_ru. */
function pickName(d: ApiDistrict, lang: string): string {
  const l = lang.toLowerCase();
  if (l.startsWith('uz')) return d.name_uz;
  if (l.startsWith('en')) return d.name_en;
  return d.name_ru;
}

/**
 * Имена района на других языках — алиасы для матчинга подсказок (поиск на
 * латинице). Исключаем выбранное отображаемое имя и пустые значения, дедупим.
 */
function aliasesFor(d: ApiDistrict, displayName: string): string[] {
  const all = [d.name_uz, d.name_ru, d.name_en];
  return [...new Set(all.filter((n) => n && n !== displayName))];
}

/**
 * snake_case район API → UI-модель {@link District}. Чистая функция (без сети) —
 * выделена для юнит-тестов выбора языка/алиасов.
 */
export function mapDistrict(api: ApiDistrict, lang = 'ru'): District {
  const name = pickName(api, lang);
  return {
    id: api.id,
    name,
    aliases: aliasesFor(api, name),
    regionId: api.region_id ?? undefined,
  };
}

/**
 * Список районов для дропдаунов фильтра и блока «Районы» на главной.
 * GET /api/v1/geo/districts. Справочник редко меняется → кэш на 1 час
 * (`revalidate`). При ошибке API (5xx/4xx/сеть) деградирует до пустого списка
 * вместо краха SSR — секция/дропдаун просто пустые (логируется на сервере).
 */
export async function getDistricts(lang = 'ru'): Promise<District[]> {
  try {
    const res = await fetch(`${resolveApiBase()}/geo/districts`, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json', 'Accept-Language': lang },
    });
    if (!res.ok) {
      throw new Error(`API ${res.status} ${res.statusText} for /geo/districts`);
    }
    const data = (await res.json()) as ApiDistrict[];
    return data.map((d) => mapDistrict(d, lang));
  } catch (err) {
    console.error('[geo] districts fetch failed, degrading to empty list', err);
    return [];
  }
}

/** Строка справочника регионов GET /geo/regions (snake_case контракт §geo). */
export interface ApiRegion {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
}

/** Имя региона по языку интерфейса: `uz→name_uz`, `en→name_en`, иначе name_ru. */
function pickRegionName(r: ApiRegion, lang: string): string {
  const l = lang.toLowerCase();
  if (l.startsWith('uz')) return r.name_uz;
  if (l.startsWith('en')) return r.name_en;
  return r.name_ru;
}

/**
 * snake_case регион API → UI-модель {@link Region}. Чистая функция (без сети) —
 * выделена для юнит-тестов выбора языка.
 */
export function mapRegion(api: ApiRegion, lang = 'ru'): Region {
  return { id: api.id, name: pickRegionName(api, lang), code: api.code };
}

/**
 * Список регионов для дропдауна фильтра (каскад Регион → Район).
 * GET /api/v1/geo/regions. Справочник редко меняется → кэш на 1 час.
 * При ошибке деградирует до пустого списка.
 */
export async function getRegions(lang = 'ru'): Promise<Region[]> {
  try {
    const res = await fetch(`${resolveApiBase()}/geo/regions`, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json', 'Accept-Language': lang },
    });
    if (!res.ok) throw new Error(`API ${res.status} for /geo/regions`);
    return ((await res.json()) as ApiRegion[]).map((r) => mapRegion(r, lang));
  } catch (err) {
    console.error('[geo] regions fetch failed, degrading to empty list', err);
    return [];
  }
}
