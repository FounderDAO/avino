import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS-конфигурация API (TASK-024, ARCHITECTURE §24, ENV.md §15).
 *
 * Браузерные клиенты (apps/web на RTK Query) ходят с другого origin
 * (http://localhost:3000 в dev, домен админки в prod) на API
 * (http://localhost:4000 / api.avino.uz), поэтому без CORS preflight/ответы
 * блокируются браузером. Origin-список НЕ хардкодится — берётся из ENV
 * (CORS_ORIGINS), парсинг и сборка опций вынесены сюда, чтобы переиспользовать
 * в тестах и не раздувать main.ts (по аналогии с validation.options.ts).
 */

/**
 * Разбирает CORS_ORIGINS (CSV) в массив origin'ов: триммит и отбрасывает пустые
 * элементы. Пустая/undefined-строка → [] (fail-closed: ни один cross-origin не
 * разрешён). Дедупликация сохраняет порядок первого вхождения.
 */
export function parseCorsOrigins(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  const seen = new Set<string>();
  const origins: string[] = [];
  for (const part of raw.split(',')) {
    const origin = part.trim();
    if (origin && !seen.has(origin)) {
      seen.add(origin);
      origins.push(origin);
    }
  }
  return origins;
}

/**
 * Собирает CorsOptions из списка разрешённых origin'ов.
 *
 * - origin: явный allowlist (без wildcard) — единственный безопасный режим при
 *   credentials: true.
 * - credentials: true — поддержка Authorization-заголовка и будущих cookie-сессий.
 * - exposedHeaders: X-Request-Id — браузерный клиент должен иметь возможность
 *   прочитать request_id из ответа (RequestIdInterceptor, TASK-023).
 * - maxAge: кеш preflight на сутки, чтобы не слать OPTIONS на каждый запрос.
 */
export function buildCorsOptions(origins: string[]): CorsOptions {
  return {
    origin: origins,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 86400,
  };
}
