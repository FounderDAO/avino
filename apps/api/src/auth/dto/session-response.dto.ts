/**
 * Элемент ответа `GET /api/v1/auth/sessions` (ADR-0143) — активная сессия
 * (session family refresh-токенов) текущего пользователя. snake_case по
 * контракту API.md §3.
 */
export interface SessionResponse {
  /** id сессии = `fid` (session family); аргумент `DELETE /auth/sessions/:fid`. */
  id: string;
  /** Момент логина (создание family), ISO-8601. */
  created_at: string;
  /** Момент последней ротации refresh-токена, ISO-8601 (= created_at, если ротаций не было). */
  last_rotated_at: string;
  /** User-Agent последнего выпуска refresh-токена (null, если не передавался). */
  user_agent: string | null;
  /** IP последнего выпуска refresh-токена (null, если не фиксировался). */
  ip: string | null;
  /** true — сессия, которой принадлежит предъявленный access-токен. */
  is_current: boolean;
}
