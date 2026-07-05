import * as Sentry from '@sentry/nextjs';

/**
 * Sentry для Node-рантайма (SSR/route handlers) — ADR-0129, TASK-232.
 *
 * Config-gated: DSN инлайнится на build (NEXT_PUBLIC_*, как остальные
 * публичные ключи — см. Dockerfile); пусто → init не вызывается, поведение
 * прежнее. DSN — публичный ключ, не секрет.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Только error tracking (P0 аудита) — без перформанс-трейсинга.
    tracesSampleRate: 0,
  });
}
