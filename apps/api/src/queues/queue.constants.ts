/**
 * Имена очередей и джоб BullMQ (TASK-071, ARCHITECTURE §23).
 *
 * Вынесены отдельно, чтобы продюсер ({@link TranslationQueue}) и консьюмер
 * ({@link TranslationWorker}) ссылались на одни и те же строковые имена.
 */

/** Очередь авто-перевода объявлений (acceptance: `translation_queue` exists). */
export const TRANSLATION_QUEUE_NAME = 'translation_queue';

/** Джоба перевода одного объявления на остальные языки. */
export const TRANSLATE_LISTING_JOB = 'translate_listing';

/** Полезная нагрузка джобы перевода. */
export interface TranslateListingJobData {
  listingId: string;
}

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
