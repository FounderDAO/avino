import { Prisma } from '@prisma/client';

/**
 * Логика backfill районов (scripts/backfill-districts.ts) — без Nest/БД/сети,
 * чтобы покрыть юнит-тестами: разбор флагов, SQL выборки/записи, проход.
 */

export interface BackfillArgs {
  /** false (по умолчанию) — dry-run: только посчитать, ничего не писать. */
  apply: boolean;
  limit?: number;
}

export function parseBackfillArgs(argv: string[]): BackfillArgs {
  const args: BackfillArgs = { apply: false, limit: undefined };
  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--dry-run') {
      args.apply = false;
    } else if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --limit: ${arg}`);
      }
      args.limit = value;
    } else {
      // Опечатка в --apply не должна молча превращаться в dry-run (и наоборот).
      throw new Error(`Unknown argument: ${arg} (allowed: --dry-run, --apply, --limit=N)`);
    }
  }
  return args;
}

/**
 * Кандидаты: объявления без района, но с точкой (`location` ставит триггер из
 * latitude/longitude). DELETED не трогаем — их нигде не показывают.
 */
export function candidatesSql(limit?: number): Prisma.Sql {
  return Prisma.sql`
    SELECT id::text AS id, latitude::text AS latitude, longitude::text AS longitude, status::text AS status
    FROM listings
    WHERE district_id IS NULL
      AND location IS NOT NULL
      AND status <> 'DELETED'
    ORDER BY created_at ASC
    ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  `;
}

/**
 * Запись района. `AND district_id IS NULL` — идемпотентно и не затирает район,
 * выставленный владельцем/модератором между выборкой и записью. Сырой UPDATE
 * не трогает updated_at (в отличие от prisma.listing.update) и не меняет статус.
 */
export function assignDistrictSql(listingId: string, districtId: string): Prisma.Sql {
  return Prisma.sql`UPDATE listings SET district_id = ${districtId}::uuid WHERE id = ${listingId}::uuid AND district_id IS NULL`;
}

export interface BackfillCandidate {
  id: string;
  latitude: string;
  longitude: string;
  status: string;
}

export interface BackfillDeps {
  findCandidates(limit?: number): Promise<BackfillCandidate[]>;
  /** null — геокодер недоступен; `{ districtId: null }` — район по точке не распознан. */
  resolveDistrictId(lat: string, lng: string): Promise<{ districtId: string | null } | null>;
  /** true — строка обновлена; false — район уже кто-то заполнил. */
  assignDistrict(listingId: string, districtId: string): Promise<boolean>;
  sleep(ms: number): Promise<void>;
}

export interface BackfillOptions {
  apply: boolean;
  limit?: number;
  /** Пауза между запросами к геокодеру (лимиты бесплатного тарифа), мс. */
  pauseMs?: number;
  /** Столько сбоев геокодера подряд — останавливаемся (нет ключа/квота/сеть). */
  maxConsecutiveFailures?: number;
}

export interface BackfillSummary {
  candidates: number;
  resolved: number;
  unresolved: number;
  failed: number;
  updated: number;
  aborted: boolean;
  byStatus: Record<string, number>;
  byDistrict: Record<string, number>;
  unresolvedIds: string[];
}

export async function runDistrictBackfill(
  deps: BackfillDeps,
  options: BackfillOptions,
): Promise<BackfillSummary> {
  const pauseMs = options.pauseMs ?? 0;
  const maxConsecutiveFailures = options.maxConsecutiveFailures ?? 5;
  const candidates = await deps.findCandidates(options.limit);
  const summary: BackfillSummary = {
    candidates: candidates.length,
    resolved: 0,
    unresolved: 0,
    failed: 0,
    updated: 0,
    aborted: false,
    byStatus: {},
    byDistrict: {},
    unresolvedIds: [],
  };
  for (const c of candidates) {
    summary.byStatus[c.status] = (summary.byStatus[c.status] ?? 0) + 1;
  }

  let consecutiveFailures = 0;
  for (const [index, c] of candidates.entries()) {
    if (index > 0 && pauseMs > 0) await deps.sleep(pauseMs);
    const outcome = await deps.resolveDistrictId(c.latitude, c.longitude);
    if (!outcome) {
      summary.failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= maxConsecutiveFailures) {
        summary.aborted = true;
        break;
      }
      continue;
    }
    consecutiveFailures = 0;
    if (!outcome.districtId) {
      summary.unresolved += 1;
      summary.unresolvedIds.push(c.id);
      continue;
    }
    summary.resolved += 1;
    summary.byDistrict[outcome.districtId] = (summary.byDistrict[outcome.districtId] ?? 0) + 1;
    if (options.apply && (await deps.assignDistrict(c.id, outcome.districtId))) {
      summary.updated += 1;
    }
  }
  return summary;
}
