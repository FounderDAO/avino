/**
 * HTTP-статус страницы объявления по состоянию в API (SEO: AUD-10, контракт B).
 *
 * App Router умеет отдать из страницы только 200 или 404, поэтому статус
 * ставит middleware: для `/{locale}/listing/{id}` он узнаёт состояние объявления
 * и переписывает ответ на ту же страницу с нужным статусом.
 *
 * - 410 GONE (удалено) → 410: поисковики быстро убирают URL.
 * - 404 UNDER_REVIEW (опубликованное ждёт проверки правки) → 503 + Retry-After
 *   до 7 суток с начала проверки: страница остаётся в индексе. Дольше — как
 *   обычный 404 (страница сама отдаёт notFound()).
 * - всё остальное (200, 404 NOT_FOUND, сбой API) — без вмешательства.
 */

export const LISTING_PATH_RE =
  /^\/(uz|ru|en)\/listing\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/** Предел «временной недоступности» на повторной модерации. */
export const REVIEW_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const RETRY_AFTER_SECONDS = 86_400;

export type ListingAvailability =
  | { kind: 'pass' }
  | { kind: 'gone' }
  | { kind: 'under_review' };

interface ApiErrorEnvelope {
  error?: { code?: unknown; meta?: { review_started_at?: unknown } };
}

/** Ответ GET /listings/:id → что делать со статусом страницы. */
export function classifyListingResponse(status: number, body: unknown, now = Date.now()): ListingAvailability {
  const error = (body as ApiErrorEnvelope | null)?.error;
  if (status === 410 || error?.code === 'GONE') return { kind: 'gone' };
  if (status === 404 && error?.code === 'UNDER_REVIEW') {
    const started = typeof error.meta?.review_started_at === 'string' ? Date.parse(error.meta.review_started_at) : NaN;
    // Без даты начала считаем, что проверка только началась.
    if (Number.isNaN(started) || now - started <= REVIEW_GRACE_MS) return { kind: 'under_review' };
  }
  return { kind: 'pass' };
}

/** Короткий кэш в памяти процесса, чтобы не спрашивать API на каждый просмотр. */
export class AvailabilityCache {
  private readonly map = new Map<string, { value: ListingAvailability; until: number }>();

  constructor(
    private readonly maxEntries = 2000,
    private readonly now: () => number = Date.now,
  ) {}

  get(id: string): ListingAvailability | undefined {
    const hit = this.map.get(id);
    if (!hit) return undefined;
    if (hit.until < this.now()) {
      this.map.delete(id);
      return undefined;
    }
    return hit.value;
  }

  set(id: string, value: ListingAvailability): void {
    // Обычные объявления перепроверяем чаще: правка может уйти на модерацию в любой момент.
    const ttl = value.kind === 'pass' ? 60_000 : value.kind === 'under_review' ? 300_000 : 3_600_000;
    this.map.delete(id);
    this.map.set(id, { value, until: this.now() + ttl });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
}
