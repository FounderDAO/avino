import { featureComponents, planBoundaryImport } from './boundary-import';

const regions = [
  { id: 'r-tash', code: 'toshkent-shahri', names: ['Toshkent shahri', 'город Ташкент', 'Tashkent City'] },
  { id: 'r-sam', code: 'samarqand', names: ['Samarqand viloyati', 'Самаркандская область', 'Samarkand Region'] },
];
const districts = [
  { id: 'd-yun', regionId: 'r-tash', names: ['Yunusobod', 'Юнусабад', 'Yunusabad'] },
  { id: 'd-chil', regionId: 'r-tash', names: ['Chilonzor', 'Чиланзар', 'Chilanzar'] },
  { id: 'd-urg', regionId: 'r-sam', names: ['Urgut tumani', 'Ургутский район', 'Urgut District'] },
];
const square = { type: 'Polygon', coordinates: [[[69, 41], [69.1, 41], [69.1, 41.1], [69, 41.1], [69, 41]]] };

describe('boundary import (SEO AUD-3)', () => {
  it('reads region and district names from OSM- and GADM-style properties', () => {
    expect(featureComponents({ name: 'Юнусабадский район', 'is_in:region': 'город Ташкент' })).toEqual([
      { kind: 'province', name: 'город Ташкент' },
      { kind: 'area', name: 'Юнусабадский район' },
    ]);
    expect(featureComponents({ NAME_1: 'Samarqand', NAME_2: 'Urgut' })).toEqual([
      { kind: 'province', name: 'Samarqand' },
      { kind: 'area', name: 'Urgut' },
    ]);
  });

  it('plans matches, unmatched names, duplicates and non-polygons', () => {
    const plan = planBoundaryImport(
      [
        { properties: { name: 'Yunusobod tumani', 'is_in:region': 'Toshkent shahri' }, geometry: square },
        { properties: { name: 'Чиланзар' }, geometry: { type: 'MultiPolygon', coordinates: [square.coordinates] } },
        { properties: { NAME_1: 'Samarqand', NAME_2: 'Urgut' }, geometry: square },
        { properties: { NAME_1: 'Samarqand', NAME_2: 'Urgut tumani' }, geometry: square },
        { properties: { name: 'Atlantis' }, geometry: square },
        { properties: { name: 'Yunusobod centroid' }, geometry: { type: 'Point', coordinates: [69, 41] } },
      ],
      regions,
      districts,
    );
    expect(plan.matched.map((m) => m.districtId).sort()).toEqual(['d-chil', 'd-yun']);
    expect(plan.duplicates).toEqual([{ districtId: 'd-urg', labels: ['Urgut', 'Urgut tumani'] }]);
    expect(plan.unmatched).toEqual(['Atlantis']);
    expect(plan.skipped).toEqual(['Yunusobod centroid']);
  });

  it('manual mapping resolves names the matcher does not know', () => {
    const plan = planBoundaryImport([{ properties: { name: 'Atlantis' }, geometry: square }], regions, districts, {
      Atlantis: 'd-chil',
    });
    expect(plan.matched).toEqual([{ districtId: 'd-chil', label: 'Atlantis', geometry: square }]);
  });
});
