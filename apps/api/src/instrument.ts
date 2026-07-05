import * as Sentry from '@sentry/nestjs';

/**
 * Инициализация Sentry (ADR-0129, TASK-232).
 *
 * Импортируется ПЕРВОЙ строкой main.ts — до Nest и остальных модулей, иначе
 * авто-инструментация Sentry не успевает обернуть http/express.
 *
 * Config-gated: без SENTRY_DSN init не вызывается вовсе — локальная разработка,
 * CI и стенды без аккаунта Sentry работают ровно как раньше (все
 * Sentry.capture* без init — безопасные no-op).
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // staging/production; отдельная переменная на случай NODE_ENV=development
    // на стенде (staging-overlay держит api в development — гоча OTP-логов).
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Только error tracking: перформанс-трейсы не собираем (P0 — видимость
    // ошибок; трейсинг осознанно за скоупом, см. ADR-0129).
    tracesSampleRate: 0,
  });
}
