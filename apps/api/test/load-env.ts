import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Загружает корневой `.env` в `process.env` для integration-тестов: ts-jest не
 * читает `.env` (в отличие от `@nestjs/config` в рантайме приложения), а
 * `PrismaClient` берёт `DATABASE_URL` из окружения. Уже заданные переменные не
 * перетираются — окружение CI/оболочки имеет приоритет над файлом.
 */
const envPath = join(__dirname, '..', '..', '..', '.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}
