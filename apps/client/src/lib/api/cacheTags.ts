/**
 * Теги Data Cache для публичных серверных запросов к API.
 *
 * Публичные страницы кэшируют ответы API на REVALIDATE_SECONDS (было no-store:
 * каждый просмотр ходил в API). Свежесть держит backend: при изменении
 * объявления или агента он вызывает POST /api/seo/sync, и тот сбрасывает
 * нужные теги (см. app/api/seo/sync/route.ts).
 *
 * Серверные запросы идут без Authorization, поэтому ответ один для всех
 * зрителей и его безопасно кэшировать. Presigned-ссылки на фото живут 1 час —
 * кэш заметно короче.
 */
export const REVALIDATE_SECONDS = 300;

export const CACHE_TAGS = {
  /** Любая выдача поиска (главная, /search, агент, похожие). */
  search: 'search',
  /** Все карточки объявлений. */
  listings: 'listing',
  listing: (id: string) => `listing:${id}`,
  agents: 'agents',
  agent: (id: string) => `agent:${id}`,
  /** Sitemap и llms.txt. */
  sitemap: 'sitemap',
} as const;
