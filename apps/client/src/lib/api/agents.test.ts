import { afterEach, describe, it, expect, vi } from 'vitest';
import { getAgentById, getAgents, mapAgent, type ApiAgent } from './agents';

const SAMPLE: ApiAgent = {
  id: 'u1',
  name: 'Алишер Усманов',
  avatar_url: 'https://cdn.avino.uz/u1/avatar.webp?sig=x',
  agency_name: 'Ideal Estate',
  about: '10 лет на рынке недвижимости Ташкента',
  active_listings_count: 14,
};

describe('mapAgent', () => {
  it('маппит snake_case API → camelCase UI-модель', () => {
    expect(mapAgent(SAMPLE)).toEqual({
      id: 'u1',
      name: 'Алишер Усманов',
      avatarUrl: 'https://cdn.avino.uz/u1/avatar.webp?sig=x',
      agencyName: 'Ideal Estate',
      about: '10 лет на рынке недвижимости Ташкента',
      activeListingsCount: 14,
    });
  });

  it('null-поля (агент без заявки/аватара) остаются null', () => {
    const noExtras: ApiAgent = {
      ...SAMPLE,
      name: null,
      avatar_url: null,
      agency_name: null,
      about: null,
    };
    const out = mapAgent(noExtras);
    expect(out.name).toBeNull();
    expect(out.avatarUrl).toBeNull();
    expect(out.agencyName).toBeNull();
    expect(out.about).toBeNull();
  });
});

describe('getAgents', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('GET /agents?limit= → мапит envelope.data', async () => {
    // Параметр нужен для типизации: без него vi.fn выводит args как [] и
    // обращение к mock.calls[0][0] не проходит tsc (TS2493).
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [SAMPLE],
        meta: { page: 1, limit: 20, total: 1 },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await getAgents(20);
    expect(out).toEqual([mapAgent(SAMPLE)]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/agents?limit=20');
  });

  it('деградирует до пустого списка при ошибке API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal' })),
    );
    const out = await getAgents(20);
    expect(out).toEqual([]);
  });
});

describe('getAgentById', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('200 → мапит профиль агента', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => SAMPLE })),
    );
    const out = await getAgentById('u1');
    expect(out).toEqual(mapAgent(SAMPLE));
  });

  it('404 → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const out = await getAgentById('missing');
    expect(out).toBeNull();
  });

  it('прочие ошибки (5xx) → бросает', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal' })),
    );
    await expect(getAgentById('u1')).rejects.toThrow();
  });
});
