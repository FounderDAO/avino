// apps/api/src/scripts/backfill-addresses.ts
import { NestFactory } from '@nestjs/core';
import { ListingStatus } from '@prisma/client';
import { AppModule } from '../app.module';
import { AddressResolverService, normalizeAddress } from '../geo';
import { PrismaService } from '../prisma';

/**
 * Backfill адресов существующих объявлений (ADR-0147, one-off ops).
 * С координатами → реверс-геокод ru+en; без координат → строковая нормализация.
 * Идемпотентен; пауза 300ms между геокодами (лимиты бесплатного тарифа).
 *
 * Запуск: node dist/scripts/backfill-addresses.js  (в контейнере api:
 * docker compose exec api node dist/scripts/backfill-addresses.js)
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const prisma = app.get(PrismaService);
  const resolver = app.get(AddressResolverService);

  const listings = await prisma.listing.findMany({
    where: { status: { not: ListingStatus.DELETED } },
    select: {
      id: true,
      address: true,
      latitude: true,
      longitude: true,
      districtId: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  let geocoded = 0;
  let normalized = 0;
  let skipped = 0;

  for (const l of listings) {
    if (l.latitude != null && l.longitude != null) {
      const resolved = await resolver.resolve(
        l.latitude.toString(),
        l.longitude.toString(),
        l.districtId,
      );
      await new Promise((r) => setTimeout(r, 300));
      if (resolved) {
        await prisma.listing.update({
          where: { id: l.id },
          data: { address: resolved.address, addressEn: resolved.addressEn },
        });
        geocoded += 1;
        continue;
      }
    }
    if (l.address) {
      const clean = normalizeAddress(l.address);
      if (clean !== l.address) {
        await prisma.listing.update({
          where: { id: l.id },
          data: { address: clean, addressEn: null },
        });
        normalized += 1;
        continue;
      }
    }
    skipped += 1;
  }
  console.log(
    `backfill-addresses: total=${listings.length} geocoded=${geocoded} normalized=${normalized} skipped=${skipped}`,
  );
  await app.close();
}

void main();
