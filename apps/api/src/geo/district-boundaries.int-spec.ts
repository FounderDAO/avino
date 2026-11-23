import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { DistrictsService } from './districts.service';

/**
 * Границы районов на живом PostGIS (SEO AUD-3): ST_Covers по точке, при
 * вложенности — меньший полигон. Берём сид-районы Ташкента, границы удаляем.
 */
describe('DistrictsService.districtIdByPoint (integration, live PostGIS)', () => {
  const prisma = new PrismaService();
  const districts = new DistrictsService(prisma);
  const OUTER = 'd0000000-0000-4000-8000-000000000012'; // Yunusobod (сид)
  const INNER = 'd0000000-0000-4000-8000-000000000002'; // Chilonzor (сид)

  const square = (lng0: number, lat0: number, lng1: number, lat1: number) =>
    JSON.stringify({
      type: 'Polygon',
      coordinates: [[[lng0, lat0], [lng1, lat0], [lng1, lat1], [lng0, lat1], [lng0, lat0]]],
    });

  async function putBoundary(districtId: string, geojson: string) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO district_boundaries (district_id, geom, source)
      VALUES (${districtId}::uuid, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326))::geography, 'int-spec')
      ON CONFLICT (district_id) DO UPDATE SET geom = EXCLUDED.geom
    `);
  }

  beforeAll(async () => {
    await prisma.$connect();
    await putBoundary(OUTER, square(69.0, 41.0, 69.4, 41.4));
    await putBoundary(INNER, square(69.1, 41.1, 69.2, 41.2));
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM district_boundaries WHERE source = 'int-spec'`;
    await prisma.$disconnect();
  });

  it('returns the smaller polygon when boundaries are nested (city inside a district)', async () => {
    await expect(districts.districtIdByPoint('41.15', '69.15')).resolves.toBe(INNER);
  });

  it('returns the outer district outside the inner polygon', async () => {
    await expect(districts.districtIdByPoint('41.35', '69.35')).resolves.toBe(OUTER);
  });

  it('returns null outside every boundary and for garbage coordinates', async () => {
    await expect(districts.districtIdByPoint('40.0', '60.0')).resolves.toBeNull();
    await expect(districts.districtIdByPoint('abc', '69.1')).resolves.toBeNull();
  });
});
