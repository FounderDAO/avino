/**
 * Загрузка границ районов из GeoJSON (SEO AUD-3) — чистая часть: без БД и сети.
 *
 * Название района и (если есть) региона из свойств объекта сопоставляются со
 * справочником тем же правилом, что компоненты геокодера (geo-match). Подходит
 * для выгрузок OSM, geoBoundaries, GADM — у них разные имена свойств.
 */
import { DirectoryDistrict, DirectoryRegion, GeoComponent, matchRegionDistrict } from './geo-match';

/** Свойства с названием региона (ADM1) в распространённых наборах. */
const REGION_KEYS = ['region', 'NAME_1', 'name_1', 'ADM1_EN', 'adm1_name', 'is_in:region', 'addr:region', 'state', 'province'];
/** Свойства с названием района (ADM2). */
const DISTRICT_KEYS = ['name:uz', 'name:ru', 'name:en', 'name', 'NAME_2', 'name_2', 'ADM2_EN', 'adm2_name', 'shapeName', 'int_name'];

export interface GeoJsonFeature {
  type?: string;
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

const strings = (props: Record<string, unknown>, keys: string[]) =>
  keys.map((k) => props[k]).filter((v): v is string => typeof v === 'string' && v.trim() !== '');

/** Компоненты «как у геокодера» из свойств объекта: регион → province, названия → area. */
export function featureComponents(props: Record<string, unknown> | null | undefined): GeoComponent[] {
  const p = props ?? {};
  return [
    ...strings(p, REGION_KEYS).map((name) => ({ kind: 'province', name })),
    ...strings(p, DISTRICT_KEYS).map((name) => ({ kind: 'area', name })),
  ];
}

/** Человекочитаемое имя объекта для отчёта. */
export function featureLabel(props: Record<string, unknown> | null | undefined): string {
  return strings(props ?? {}, DISTRICT_KEYS)[0] ?? '(без названия)';
}

export interface BoundaryPlan {
  matched: { districtId: string; label: string; geometry: object }[];
  unmatched: string[];
  /** Несколько объектов на один район — пропускаются, нужна ручная разметка. */
  duplicates: { districtId: string; labels: string[] }[];
  /** Не полигон (точка, линия) — пропущены. */
  skipped: string[];
}

/**
 * План загрузки: какой объект в какой район. `manual` — ручные соответствия
 * «название объекта → district_id» для того, что не распозналось.
 */
export function planBoundaryImport(
  features: GeoJsonFeature[],
  regions: DirectoryRegion[],
  districts: DirectoryDistrict[],
  manual: Record<string, string> = {},
): BoundaryPlan {
  const byDistrict = new Map<string, { label: string; geometry: object }[]>();
  const unmatched: string[] = [];
  const skipped: string[] = [];
  for (const f of features) {
    const label = featureLabel(f.properties);
    const type = f.geometry?.type;
    if (type !== 'Polygon' && type !== 'MultiPolygon') {
      skipped.push(label);
      continue;
    }
    const districtId = manual[label] ?? matchRegionDistrict(featureComponents(f.properties), regions, districts).districtId;
    if (!districtId) {
      unmatched.push(label);
      continue;
    }
    const list = byDistrict.get(districtId) ?? [];
    list.push({ label, geometry: f.geometry as object });
    byDistrict.set(districtId, list);
  }
  const matched: BoundaryPlan['matched'] = [];
  const duplicates: BoundaryPlan['duplicates'] = [];
  for (const [districtId, list] of byDistrict) {
    if (list.length === 1) matched.push({ districtId, ...list[0] });
    else duplicates.push({ districtId, labels: list.map((x) => x.label) });
  }
  return { matched, unmatched, duplicates, skipped };
}
