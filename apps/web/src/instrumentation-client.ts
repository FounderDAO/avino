import * as Sentry from '@sentry/nextjs';

/**
 * Sentry в БРАУЗЕРЕ админки (ADR-0129, TASK-232). Автоподхват Next ≥15.3
 * (в репо 15.5.x) — обёртка withSentryConfig не нужна.
 *
 * Config-gated: NEXT_PUBLIC_SENTRY_DSN инлайнится на build; пусто → init не
 * вызывается, бандл ведёт себя как раньше.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

// Хук роутера обязателен по контракту @sentry/nextjs v10 (no-op без init).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
