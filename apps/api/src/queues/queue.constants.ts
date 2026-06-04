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
