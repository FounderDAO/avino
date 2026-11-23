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

/**
 * Очередь диспетчера доставки уведомлений (ADR-0102). Несёт периодическую
 * джобу `dispatch_notifications`, которая fan-out'ит свежие уведомления по
 * email/push и доставляет PENDING-записи NotificationDelivery.
 */
export const NOTIFICATION_DISPATCH_QUEUE_NAME = 'notification_dispatch_queue';

/**
 * Периодическая sweep-джоба диспетчера (ADR-0102). Запускается по расписанию
 * (repeatable job scheduler), без точечной нагрузки — sweep по последним
 * уведомлениям внутри lookback-окна.
 */
export const DISPATCH_NOTIFICATIONS_JOB = 'dispatch_notifications';

/**
 * Нагрузка sweep-джобы диспетчера. Пустая: джоба сама находит все свежие
 * уведомления в lookback-окне и PENDING-доставки для обработки.
 */
export type DispatchNotificationsJobData = Record<string, never>;

/**
 * Очередь sweep-рассылок (ADR-0103). Несёт периодическую джобу
 * `dispatch_broadcasts`, которая материализует SCHEDULED-рассылки с
 * `scheduled_at <= now()` в Notification/NotificationDelivery.
 */
export const BROADCAST_DISPATCH_QUEUE_NAME = 'broadcast_dispatch_queue';

/**
 * Периодическая sweep-джоба диспетчера рассылок (ADR-0103). Запускается по
 * расписанию (repeatable job scheduler), без точечной нагрузки — sweep по
 * всем SCHEDULED с `scheduled_at <= now()`.
 */
export const DISPATCH_BROADCASTS_JOB = 'dispatch_broadcasts';

/**
 * Нагрузка sweep-джобы. Пустая: джоба сама находит все созревшие SCHEDULED
 * рассылки — конкретный broadcastId не передаётся.
 */
export type DispatchBroadcastsJobData = Record<string, never>;

/**
 * Очередь скачивания фото импорта по ссылкам (спека 2026-10-03 §3). Одна задача
 * — одно фото; `jobId = photoId` не даёт поставить фото дважды, пока задача жива.
 */
export const LISTING_IMPORT_PHOTO_QUEUE_NAME = 'listing_import_photo_queue';

export const FETCH_IMPORT_PHOTO_JOB = 'fetch_import_photo';

export interface FetchImportPhotoJobData {
  photoId: string;
}

/**
 * `removeOnFail: true` обязателен: оставленная упавшая задача с тем же jobId
 * молча заблокировала бы повторную постановку из `retry`.
 */
export const LISTING_IMPORT_PHOTO_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/**
 * Синхронизация изменённого объявления с сайтом (SEO AUD-11): одна задача —
 * одно объявление; `jobId = listingId` + задержка схлопывают серию правок в
 * один вызов `POST /api/seo/sync`.
 */
export const LISTING_URL_SYNC_QUEUE_NAME = 'listing_url_sync_queue';

export const SYNC_LISTING_URLS_JOB = 'sync_listing_urls';

export interface SyncListingUrlsJobData {
  listingId: string;
}

/** `removeOnFail: true` — упавшая задача с тем же jobId иначе блокировала бы новую постановку. */
export const LISTING_URL_SYNC_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/**
 * Повторное определение района по точке (SEO AUD-2): раньше сбой геокодера при
 * создании или правке молча оставлял объявление без района — и вне фильтра по
 * региону. Одна задача — одно объявление (`jobId = listingId`).
 */
export const GEO_RESOLVE_QUEUE_NAME = 'geo_resolve_queue';

export const RESOLVE_LISTING_DISTRICT_JOB = 'resolve_listing_district';

export interface ResolveListingDistrictJobData {
  listingId: string;
}

/** 6 попыток с шагом от минуты: переживает короткий сбой или исчерпанную квоту геокодера. */
export const GEO_RESOLVE_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/**
 * Машинный перевод объявления после одобрения (SEO AUD-14): включается
 * TRANSLATE_ON_APPROVE. Ручные правки переводов не перезаписываются.
 */
export const LISTING_TRANSLATE_QUEUE_NAME = 'listing_translate_queue';

export const TRANSLATE_LISTING_JOB = 'translate_listing';

export interface TranslateListingJobData {
  listingId: string;
}

export const LISTING_TRANSLATE_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

/**
 * Обработка загруженного фото (SEO AUD-8): WebP-варианты, размеры, thumbnail.
 * Одна задача — одно медиа (`jobId = mediaId`).
 */
export const MEDIA_PROCESSING_QUEUE_NAME = 'media_processing_queue';

export const PROCESS_UPLOADED_IMAGE_JOB = 'process_uploaded_image';

export interface ProcessUploadedImageJobData {
  mediaId: string;
}

export const MEDIA_PROCESSING_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;
