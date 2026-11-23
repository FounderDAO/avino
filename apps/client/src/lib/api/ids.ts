/**
 * id объявлений и агентов в API — UUID. Кривой id API отвергает 400-м, а
 * fetchOrNull превращает это в 500; для пользователя и поиска это «нет такой
 * страницы», поэтому проверяем формат до запроса и отвечаем 404.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
