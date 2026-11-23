// apps/api/src/scripts/load-district-boundaries.ts
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from '../app.module';
import { GeoJsonFeature, planBoundaryImport } from '../geo/boundary-import';
import { PrismaService } from '../prisma';

/**
 * Загрузка границ районов из GeoJSON (SEO AUD-3, one-off ops). После загрузки
 * район по точке определяется через PostGIS (ST_Covers), геокодер — запасной.
 *
 *   node dist/scripts/load-district-boundaries.js boundaries.geojson --source="OSM 2026-11"
 *   ... --map=manual.json   # {"Название объекта": "<district_id>"} для нераспознанных
 *   ... --apply             # записать (по умолчанию DRY-RUN — только отчёт)
 *
 * Источник и лицензию выбирает владелец: OSM (ODbL — атрибуция «© OpenStreetMap
 * contributors», share-alike для производной базы), geoBoundaries, GADM и т. п.
 */
async function loadDistrictBoundaries(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Usage: load-district-boundaries <file.geojson> [--source=…] [--map=file.json] [--apply]');
  const apply = args.includes('--apply');
  const source = args.find((a) => a.startsWith('--source='))?.slice('--source='.length) ?? 'geojson import';
  const mapFile = args.find((a) => a.startsWith('--map='))?.slice('--map='.length);
  const manual = mapFile ? (JSON.parse(readFileSync(mapFile, 'utf8')) as Record<string, string>) : {};
  const collection = JSON.parse(readFileSync(file, 'utf8')) as { features?: GeoJsonFeature[] };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const prisma = app.get(PrismaService);
    const [regions, districts] = await Promise.all([
      prisma.region.findMany({ select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true } }),
      prisma.district.findMany({ select: { id: true, nameUz: true, nameRu: true, nameEn: true, regionId: true } }),
    ]);
    const plan = planBoundaryImport(
      collection.features ?? [],
      regions.map((r) => ({ id: r.id, code: r.code, names: [r.nameUz, r.nameRu, r.nameEn] })),
      districts.map((d) => ({ id: d.id, regionId: d.regionId, names: [d.nameUz, d.nameRu, d.nameEn] })),
      manual,
    );
    /* eslint-disable no-console */
    console.log(`load-district-boundaries (${apply ? 'APPLY' : 'DRY-RUN — ничего не записано'}), источник: ${source}`);
    console.log(`  сопоставлено: ${plan.matched.length} из ${districts.length} районов справочника`);
    console.log(`  не распознано: ${plan.unmatched.length}${plan.unmatched.length ? ` — ${plan.unmatched.slice(0, 20).join(', ')}` : ''}`);
    console.log(`  несколько объектов на район (пропущены): ${plan.duplicates.length}`);
    console.log(`  не полигоны (пропущены): ${plan.skipped.length}`);
    if (apply) {
      for (const m of plan.matched) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO district_boundaries (district_id, geom, source)
          VALUES (${m.districtId}::uuid,
                  ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(m.geometry)}), 4326))::geography,
                  ${source})
          ON CONFLICT (district_id) DO UPDATE
            SET geom = EXCLUDED.geom, source = EXCLUDED.source, updated_at = now()
        `);
      }
      console.log(`  записано: ${plan.matched.length}`);
    }
    /* eslint-enable no-console */
  } finally {
    await app.close();
  }
}

void loadDistrictBoundaries();
