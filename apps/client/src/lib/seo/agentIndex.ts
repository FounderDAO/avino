/**
 * Порог индексации профиля агента (правило для UGC: индексируем только
 * страницы, где есть содержание). Профиль без описания и с 1–2 объявлениями —
 * почти пустая страница: noindex, follow и вне sitemap, пока не наполнится.
 */
export const AGENT_MIN_LISTINGS = 3;

export function isAgentIndexable(agent: { about?: string | null; activeListingsCount?: number | null }): boolean {
  return Boolean(agent.about?.trim()) || (agent.activeListingsCount ?? 0) >= AGENT_MIN_LISTINGS;
}
