import { ConnectionOptions } from 'bullmq';

/**
 * Построить опции подключения BullMQ из `REDIS_URL` (TASK-071).
 *
 * BullMQ принимает структурный объект опций ioredis (а не инстанс класса), что
 * избегает несовпадения версий ioredis между приложением и бандлом BullMQ.
 * `maxRetriesPerRequest: null` обязателен для воркеров/блокирующих команд BullMQ.
 */
export function buildBullConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.replace(/^\//, '');
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: db ? parseInt(db, 10) : undefined,
    maxRetriesPerRequest: null,
  };
}
