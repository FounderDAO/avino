/**
 * Серверный слой публичного каталога агентов (реальный NestJS API).
 *
 * Вызывается ТОЛЬКО из server components (главная / `/agents/[id]`) и приводит
 * snake_case-ответ бэкенда к UI-модели {@link Agent}. Зеркалит `lib/api/geo.ts`
 * (та же форма try/catch-деградации для справочных списков).
 *
 * Эндпоинты (API.md §21, ADR-0140):
 *  - GET /api/v1/agents      — публичный каталог агентов (envelope { data, meta }).
 *  - GET /api/v1/agents/:id  — публичный профиль агента (или 404).
 */
import { resolveApiBase } from './base';

/** Строка каталога/профиля агента (snake_case контракт §21). */
export interface ApiAgent {
  id: string;
  name: string | null;
  avatar_url: string | null;
  agency_name: string | null;
  about: string | null;
  active_listings_count: number;
}

/** Envelope GET /agents (постраничный список). */
interface ApiAgentsEnvelope {
  data: ApiAgent[];
  meta: { page: number; limit: number; total: number };
}

/** UI-модель агента публичного каталога/профиля. */
export interface Agent {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  agencyName: string | null;
  about: string | null;
  activeListingsCount: number;
}

/**
 * snake_case агент API → UI-модель {@link Agent}. Чистая функция (без сети) —
 * выделена для юнит-тестов маппинга.
 */
export function mapAgent(api: ApiAgent): Agent {
  return {
    id: api.id,
    name: api.name,
    avatarUrl: api.avatar_url,
    agencyName: api.agency_name,
    about: api.about,
    activeListingsCount: api.active_listings_count,
  };
}

/**
 * Публичный каталог агентов (сортировка по числу активных объявлений, §21).
 * GET /api/v1/agents?limit=. При ошибке API (5xx/4xx/сеть) деградирует до
 * пустого списка вместо краха SSR — как getDistricts/getRegions в geo.ts.
 */
export async function getAgents(limit: number): Promise<Agent[]> {
  try {
    const res = await fetch(`${resolveApiBase()}/agents?limit=${limit}`, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`API ${res.status} ${res.statusText} for /agents`);
    }
    const env = (await res.json()) as ApiAgentsEnvelope;
    return env.data.map(mapAgent);
  } catch (err) {
    console.error('[agents] catalog fetch failed, degrading to empty list', err);
    return [];
  }
}

/**
 * Публичный профиль агента. GET /api/v1/agents/:id (404 → null, как
 * getListingById в listings.ts). Прочие ошибки — бросает: страница /agents/:id
 * решает сама (notFound() на null, error boundary на исключение).
 */
export async function getAgentById(id: string): Promise<Agent | null> {
  const res = await fetch(`${resolveApiBase()}/agents/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} for /agents/${id}`);
  }
  return mapAgent((await res.json()) as ApiAgent);
}
