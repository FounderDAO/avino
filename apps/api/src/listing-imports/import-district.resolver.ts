/**
 * Район по точке для строк импорта (ADR-0162, правка 2026-10-23).
 *
 * Импорт создаёт объявления без похода в геокодер за адресом, но без района
 * объявление не попадает в фильтр по региону (поиск по Ташкенту по умолчанию
 * показывал «0 объявлений»). Поэтому перед записью строк районы по координатам
 * определяются одним ru-запросом на строку: только для строк с координатами и
 * без района, параллельно в несколько потоков. Геокодер недоступен — после
 * `maxFailures` сбоев перестаём его дёргать (импорт синхронный, ждать по 3 с
 * на строку нельзя); оставшиеся районы доставит scripts/backfill-districts.
 */

/** Поля данных объявления, которые нужны резолверу (мутируется только districtId). */
export interface ImportDistrictTarget {
  latitude?: unknown;
  longitude?: unknown;
  districtId?: string | null;
}

export type ResolveDistrictFn = (lat: string, lng: string) => Promise<{ districtId: string | null } | null>;

export interface ImportDistrictStats {
  resolved: number;
  unresolved: number;
  failed: number;
  /** Остановились из-за сбоев геокодера — часть строк не проверена. */
  aborted: boolean;
}

export async function resolveImportDistricts(
  rows: ImportDistrictTarget[],
  resolveDistrictId: ResolveDistrictFn,
  options: { concurrency?: number; maxFailures?: number } = {},
): Promise<ImportDistrictStats> {
  const concurrency = options.concurrency ?? 4;
  const maxFailures = options.maxFailures ?? 3;
  const queue = rows.filter((r) => r.latitude != null && r.longitude != null && !r.districtId);
  const stats: ImportDistrictStats = { resolved: 0, unresolved: 0, failed: 0, aborted: false };
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < queue.length) {
      if (stats.failed >= maxFailures) {
        stats.aborted = true;
        return;
      }
      const target = queue[next++];
      let outcome: { districtId: string | null } | null;
      try {
        outcome = await resolveDistrictId(String(target.latitude), String(target.longitude));
      } catch {
        outcome = null;
      }
      if (!outcome) {
        stats.failed += 1;
      } else if (outcome.districtId) {
        target.districtId = outcome.districtId;
        stats.resolved += 1;
      } else {
        stats.unresolved += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  if (stats.failed >= maxFailures && stats.resolved + stats.unresolved + stats.failed < queue.length) {
    stats.aborted = true;
  }
  return stats;
}
