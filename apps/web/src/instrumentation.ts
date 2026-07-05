import * as Sentry from '@sentry/nextjs';

/**
 * Next instrumentation hook — грузит Sentry-конфиг своего рантайма при старте
 * сервера админки (ADR-0129, TASK-232).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Ошибки рендера RSC/route handlers → Sentry (no-op без init).
export const onRequestError = Sentry.captureRequestError;
