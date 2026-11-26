// apps/api/src/scripts/backfill-districts.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AddressResolverService, DistrictsService } from '../geo';
import { PrismaService } from '../prisma';
import {
  assignDistrictSql,
  BackfillCandidate,
  candidatesSql,
  parseBackfillArgs,
  reassignDistrictSql,
  ReconcileCandidate,
  reconcileCandidatesSql,
  runDistrictBackfill,
  runDistrictReconcile,
} from './backfill-districts.plan';

/**
 * Backfill района (`district_id`) объявлений по точке (one-off ops, правка
 * 2026-10-23). Объявления без района выпадают из фильтра по региону, а поиск
 * по умолчанию ограничен Ташкентом → «0 объявлений» на первой загрузке.
 *
 * Кандидаты: district_id IS NULL, location IS NOT NULL, статус не DELETED.
 * Район — по компонентам Yandex-геокодера для точки (как в визарде, geo-match.ts),
 * один ru-запрос на объявление, пауза 300ms между запросами.
 *
 * По умолчанию DRY-RUN: геокодирует и печатает, что было бы записано, но в БД
 * ничего не пишет. --apply — записать. Идемпотентен: пишет только туда, где
 * район всё ещё пустой; updated_at и статус не трогает.
 *
 * Запуск (в контейнере api, после деплоя этой версии):
 *   docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app \
 *     exec api node dist/scripts/backfill-districts.js            # dry-run
 *   ... exec api node dist/scripts/backfill-districts.js --apply  # запись
 *   опционально --limit=N — первые N кандидатов (по created_at).
 *
 * --reconcile (правка 2026-11-26): сверить УЖЕ заполненные районы с адресом.
 * Адрес явно называет район другого региона («г.Ташкент, Юнусабадский
 * 16-квартал», а район — «Ташкентский» области) → район из адреса. Только
 * текст, без геокодера; dry-run печатает каждую замену.
 *   ... exec api node dist/scripts/backfill-districts.js --reconcile            # dry-run
 *   ... exec api node dist/scripts/backfill-districts.js --reconcile --apply
 */
async function backfillDistricts(): Promise<void> {
  const args = parseBackfillArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  try {
    const prisma = app.get(PrismaService);
    const resolver = app.get(AddressResolverService);
    const districts = app.get(DistrictsService);

    if (args.reconcile) {
      await reconcileDistricts(prisma, districts, args.apply, args.limit);
      return;
    }

    const summary = await runDistrictBackfill(
      {
        findCandidates: (limit) => prisma.$queryRaw<BackfillCandidate[]>(candidatesSql(limit)),
        resolveDistrictId: (lat, lng, address) => resolver.resolveDistrictId(lat, lng, address),
        assignDistrict: async (id, districtId) =>
          (await prisma.$executeRaw(assignDistrictSql(id, districtId))) > 0,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      },
      { apply: args.apply, limit: args.limit, pauseMs: 300 },
    );

    const names = await districts.namesByIds(Object.keys(summary.byDistrict));
    const byDistrict = Object.entries(summary.byDistrict)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `  ${names.get(id)?.nameRu ?? id}: ${count}`);
    /* eslint-disable no-console */
    console.log(`backfill-districts (${args.apply ? 'APPLY' : 'DRY-RUN — ничего не записано'})`);
    console.log(
      `candidates=${summary.candidates} resolved=${summary.resolved} unresolved=${summary.unresolved} ` +
        `failed=${summary.failed} updated=${summary.updated}`,
    );
    console.log(`by status: ${JSON.stringify(summary.byStatus)}`);
    if (byDistrict.length > 0) console.log(`by district:\n${byDistrict.join('\n')}`);
    if (summary.unresolvedIds.length > 0) {
      console.log(`unresolved (район по точке не распознан): ${summary.unresolvedIds.join(', ')}`);
    }
    if (summary.aborted) {
      console.log('ОСТАНОВЛЕНО: геокодер недоступен подряд несколько раз (YANDEX_MAPS_API_KEY / квота / сеть).');
      process.exitCode = 2;
    }
    /* eslint-enable no-console */
  } finally {
    await app.close();
  }
}

async function reconcileDistricts(
  prisma: PrismaService,
  districts: DistrictsService,
  apply: boolean,
  limit?: number,
): Promise<void> {
  const summary = await runDistrictReconcile(
    {
      findCandidates: (n) => prisma.$queryRaw<ReconcileCandidate[]>(reconcileCandidatesSql(n)),
      reconcile: async (districtId, address) => {
        const names = (await districts.namesByIds([districtId])).get(districtId);
        if (!names) return districtId;
        return (await districts.reconcileWithAddress({ id: districtId, names }, address))?.id ?? districtId;
      },
      reassign: async (id, from, to) => (await prisma.$executeRaw(reassignDistrictSql(id, from, to))) > 0,
    },
    { apply, limit },
  );
  const ids = [...new Set(summary.changes.flatMap((c) => [c.from, c.to]))];
  const names = await districts.namesByIds(ids);
  const name = (id: string) => names.get(id)?.nameRu ?? id;
  /* eslint-disable no-console */
  console.log(`backfill-districts --reconcile (${apply ? 'APPLY' : 'DRY-RUN — ничего не записано'})`);
  console.log(`candidates=${summary.candidates} changed=${summary.changed} updated=${summary.updated}`);
  for (const c of summary.changes) {
    console.log(`  ${c.id}: ${name(c.from)} → ${name(c.to)} | ${c.address}`);
  }
  /* eslint-enable no-console */
}

backfillDistricts().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
