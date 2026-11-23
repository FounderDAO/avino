/**
 * Публичный кэш ответов, одинаковых для всех зрителей (SEO, аудит backend §I).
 * Без него каждый запрос сайта и браузера шёл в базу; CDN и кэш сайта не могли
 * переиспользовать ответ.
 */

/** Гео-справочники меняются только миграциями: сутки + неделя stale-while-revalidate. */
export const GEO_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

/**
 * Каталог и профили агентов: публичны (без авторизации и данных зрителя). 5 минут —
 * заметно меньше жизни presigned-ссылки на аватар (1 час).
 */
export const AGENTS_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600';
