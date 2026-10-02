/**
 * Массовые действия модерации из списка объявлений (панель «Выбрано: N»).
 *
 * Отдельного bulk-эндпоинта нет: действие уходит по каждому id в
 * `PATCH /admin/listings/:id/status`. Часть выбранных строк сервер законно
 * отклонит (SOLD/RENTED/уже в архиве → 422, нет переводов для APPROVE → 422),
 * поэтому результат — не «успех/ошибка», а счётчики: сколько применилось и
 * сколько пропущено по каждой причине.
 */
import { getApiError, getApiErrorCode } from '@/store/api/apiError';

export type BulkModerationAction = 'APPROVE' | 'ARCHIVE';

export type BulkSkipReason = 'status' | 'translations' | 'notFound' | 'forbidden' | 'other';

export interface BulkModerationResult {
  ok: number;
  skipped: Partial<Record<BulkSkipReason, number>>;
}

/** Одновременных запросов — чтобы большая выборка не упёрлась в throttler API. */
const CONCURRENCY = 5;

function skipReason(error: unknown): BulkSkipReason {
  const status = (error as { status?: unknown } | undefined)?.status;
  const code = getApiErrorCode(error as never);
  const msg = getApiError(error as never)?.message ?? '';
  if (status === 422 && msg.includes('Translations required')) return 'translations';
  if (status === 422 || code === 'INVALID_STATUS_TRANSITION') return 'status';
  if (status === 404) return 'notFound';
  if (status === 403) return 'forbidden';
  return 'other';
}

/**
 * Применить действие к каждому id (`run` — unwrap-нутая мутация, бросает на
 * ошибке). Отказ одного объявления не прерывает остальные.
 */
export async function runBulkModeration(
  ids: string[],
  run: (id: string) => Promise<unknown>,
): Promise<BulkModerationResult> {
  const result: BulkModerationResult = { ok: 0, skipped: {} };
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        await run(id);
        result.ok += 1;
      } catch (err) {
        const reason = skipReason(err);
        result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return result;
}

const DONE_LABEL: Record<BulkModerationAction, string> = {
  APPROVE: 'Одобрено',
  ARCHIVE: 'Перемещено в архив',
};

const SKIP_LABEL: Record<BulkSkipReason, string> = {
  status: 'статус не позволяет',
  translations: 'нет переводов',
  notFound: 'не найдено',
  forbidden: 'нет прав',
  other: 'ошибка',
};

const SKIP_ORDER: BulkSkipReason[] = ['status', 'translations', 'notFound', 'forbidden', 'other'];

/** Текст тоста по итогам массового действия (RU). */
export function bulkModerationToast(
  action: BulkModerationAction,
  { ok, skipped }: BulkModerationResult,
): string {
  const head = `${DONE_LABEL[action]}: ${ok}`;
  const parts = SKIP_ORDER.filter((r) => skipped[r]).map((r) => `${SKIP_LABEL[r]} — ${skipped[r]}`);
  if (parts.length === 0) return head;
  const total = SKIP_ORDER.reduce((n, r) => n + (skipped[r] ?? 0), 0);
  return `${head}. Пропущено: ${total} (${parts.join(', ')})`;
}
