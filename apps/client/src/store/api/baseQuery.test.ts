/**
 * baseQueryWithReauth — кросс-вкладочная сериализация refresh.
 *
 * Регрессия (устройство «залипает», лаг, «по IP»): две вкладки, одновременно
 * поймавшие 401, ротировали ОДИН и тот же refresh-токен из общего localStorage.
 * Вторая предъявляла уже отработанный → TOKEN_REUSED → сервер отзывал всю
 * session family, устройство ловило каскад 401 + 429 (throttle /auth/refresh =
 * 20/60s на IP). Фикс: refresh всегда читает свежайший токен из localStorage и
 * сериализуется между вкладками через Web Locks API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeStore } from '../store';
import { baseQueryWithReauth } from './baseQuery';
import { setCredentials } from '../slices/authSlice';

const REFRESH_TOKEN_KEY = 'avino.client.refresh_token';

type Store = ReturnType<typeof makeStore>;

function makeApi(store: Store) {
  return {
    signal: undefined as unknown as AbortSignal,
    abort: () => {},
    dispatch: store.dispatch,
    getState: store.getState,
    extra: undefined,
    endpoint: 'test',
    type: 'query' as const,
    forced: false,
  };
}

const tokenPair = (access: string, refresh: string) =>
  new Response(
    JSON.stringify({
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: 900,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

const unauthorized = () =>
  new Response('{}', {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });

/**
 * fetchBaseQuery (RTK 2.x) зовёт `fetch(new Request(...))` одним аргументом —
 * читаем url/заголовки/тело из Request, а не из RequestInit.
 */
async function readRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ url: string; auth: string | null; body: string }> {
  if (input instanceof Request) {
    return {
      url: input.url,
      auth: input.headers.get('authorization'),
      body: await input.clone().text(),
    };
  }
  return {
    url: String(input),
    auth: new Headers(init?.headers).get('authorization'),
    body: String(init?.body ?? ''),
  };
}

describe('baseQueryWithReauth: кросс-вкладочный refresh', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('на 401 ротирует по СВЕЖЕМУ токену из localStorage, а не по Redux-снапшоту', async () => {
    const store = makeStore();
    // Redux держит устаревший refresh (setCredentials зеркалит его в LS)...
    store.dispatch(setCredentials({ access_token: 'a', refresh_token: 'stale' }));
    // ...но соседняя вкладка уже ротировала — в localStorage лежит свежий.
    window.localStorage.setItem(REFRESH_TOKEN_KEY, 'fresh');

    const refreshBodies: string[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const { url, auth, body } = await readRequest(input, init);
        if (url.endsWith('/auth/refresh')) {
          refreshBodies.push(body);
          return tokenPair('a2', 'r2');
        }
        return auth === 'Bearer a2' ? new Response('{}', { status: 200 }) : unauthorized();
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await baseQueryWithReauth({ url: '/favorites' }, makeApi(store), {});

    // Ровно одна ротация — свежим токеном (нет двойной ротации/TOKEN_REUSED).
    expect(refreshBodies).toHaveLength(1);
    expect(JSON.parse(refreshBodies[0]).refresh_token).toBe('fresh');
    // Исходный запрос переигран с новым access → успех.
    expect(result.error).toBeUndefined();
  });

  it('обёртывает refresh в navigator.locks (очередь на весь origin)', async () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'a', refresh_token: 'r' }));

    const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb());
    vi.stubGlobal('navigator', { locks: { request } });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { url, auth } = await readRequest(input, init);
      if (url.endsWith('/auth/refresh')) return tokenPair('a2', 'r2');
      return auth === 'Bearer a2' ? new Response('{}', { status: 200 }) : unauthorized();
    });
    vi.stubGlobal('fetch', fetchMock);

    await baseQueryWithReauth({ url: '/favorites' }, makeApi(store), {});

    expect(request).toHaveBeenCalledWith(
      'avino.client.auth-refresh',
      expect.any(Function),
    );
  });
});
