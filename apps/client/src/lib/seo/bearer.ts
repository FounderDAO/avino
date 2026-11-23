/**
 * Проверка `Authorization: Bearer <secret>` для служебных endpoint'ов,
 * которые вызывает backend (/api/indexnow, /api/seo/sync). Сравнение — за
 * постоянное время; пустой секрет в env закрывает endpoint.
 */
import { timingSafeEqual } from 'node:crypto';

export function bearerAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice('Bearer '.length));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
