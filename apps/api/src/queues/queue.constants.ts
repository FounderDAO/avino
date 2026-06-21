/**
 * Имена очередей и джоб BullMQ (TASK-071, ARCHITECTURE §23).
 *
 * Вынесены отдельно, чтобы продюсеры и консьюмеры ссылались на одни и те же
 * строковые имена.
 */

/**
 * Очередь доставки email (TASK-101, ARCHITECTURE §23, acceptance: `email_queue`
 * exists). Транспортно-нейтральная: переносит готовое к отправке письмо до
 * воркера, который выполняет реальную SMTP-доставку и логирует результат.
 */
export const EMAIL_QUEUE_NAME = 'email_queue';

/** Джоба отправки одного письма (ARCHITECTURE §23 — `send_email`). */
export const SEND_EMAIL_JOB = 'send_email';

/**
 * Полезная нагрузка джобы отправки письма. Контракт намеренно нейтрален к
 * назначению (OTP, уведомления, saved-search alerts) — формирование subject/body
 * остаётся на стороне продюсера ({@link EmailService}).
 */
export interface SendEmailJobData {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Очередь polling-матчера сохранённых поисков (TASK-102, ARCHITECTURE §16/§23,
 * acceptance: `saved_search_queue` exists). Несёт периодическую джобу
 * `check_saved_searches`, которая перепроверяет активные saved searches и
 * эмитит дедуплицированные алерты по объявлениям, ставшим ACTIVE.
 */
export const SAVED_SEARCH_QUEUE_NAME = 'saved_search_queue';

/**
 * Периодическая джоба матчера сохранённых поисков (ARCHITECTURE §16/§17 —
 * `check_saved_searches`). Запускается по расписанию (repeatable job scheduler):
 * один прогон перебирает активные поиски и по каждому ставит алерты по новым
 * совпадениям. Нагрузка не точечная (sweep), конкретный поиск не передаётся.
 */
export const CHECK_SAVED_SEARCHES_JOB = 'check_saved_searches';

/**
 * Нагрузка sweep-джобы матчера. Пустая: джоба сама находит все активные поиски и
 * для каждого окно новых ACTIVE-листингов по `last_checked_at`.
 */
export type CheckSavedSearchesJobData = Record<string, never>;

/**
 * Очередь фоновых задач продвижения (TASK-123, acceptance: `promotion_queue`
 * exists). Сейчас несёт единственную периодическую джобу истечения промо.
 */
export const PROMOTION_QUEUE_NAME = 'promotion_queue';

/**
 * Джоба периодического сметания истёкших промо (acceptance:
 * `expire_listing_promotions` job exists). Запускается по расписанию (repeatable
 * job scheduler), без точечной нагрузки — это sweep по всем просроченным ACTIVE.
 */
export const EXPIRE_LISTING_PROMOTIONS_JOB = 'expire_listing_promotions';

/**
 * Нагрузка sweep-джобы. Пустая: джоба сама находит все ACTIVE-промо с
 * `expires_at <= now()` — конкретный listingId не передаётся.
 */
export type ExpireListingPromotionsJobData = Record<string, never>;

/** Очередь ежедневного обновления курса валют. */
export const EXCHANGE_RATE_QUEUE_NAME = 'exchange_rate_queue';

/** Repeatable-джоба: тянет USD/UZS из cbu.uz и пишет новую строку. */
export const REFRESH_EXCHANGE_RATE_JOB = 'refresh_exchange_rate';

/** Нагрузка пустая: джоба сама делает один fetch + insert. */
export type RefreshExchangeRateJobData = Record<string, never>;

/**
 * Очередь фоновой чистки осиротевших фото в R2 (ADR-0099). Несёт периодическую
 * джобу `cleanup_orphan_media` (sweep, без точечной нагрузки).
 */
export const MEDIA_CLEANUP_QUEUE_NAME = 'media_cleanup_queue';

/** Периодическая sweep-джоба чистки orphan-медиа. Нагрузка пустая. */
export const CLEANUP_ORPHAN_MEDIA_JOB = 'cleanup_orphan_media';

/** Нагрузка пустая: джоба сама перечисляет объекты и сверяет с listing_media. */
export type CleanupOrphanMediaJobData = Record<string, never>;
