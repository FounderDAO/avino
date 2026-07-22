/**
 * baseQueryWithReauth — авто-refresh по httpOnly cookie (ADR-0153, TASK-256 PR-2).
 *
 * refresh уехал в cookie `avino_rt`: на 401 клиент дёргает `/auth/refresh` БЕЗ
 * ТЕЛА (сервер ротирует по cookie и ставит новую), кладёт свежий access и
 * переигрывает исходный запрос. JS-токена больше нет — гонки «двойная ротация
 * одного токена из localStorage» не существует. Web Locks остаётся как
 * defense-in-depth переходного периода (#447).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeStore } from '../store';
import { baseQueryWithReauth } from './baseQuery';
import { setCredentials, selectAccessToken } from '../slices/authSlice';

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

const tokenPair = (access: string) =>
  new Response(
    JSON.stringify({
      access_token: access,
      // Тело всё ещё несёт refresh_token (mobile-контракт), но web его игнорит.
      refresh_token: 'ignored-by-web',
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

describe('baseQueryWithReauth: refresh по cookie (ADR-0153)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('на 401 ротирует БЕЗ тела (сервер читает cookie), кладёт новый access и переигрывает запрос', async () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'a' }));

    const refreshBodies: string[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const { url, auth, body } = await readRequest(input, init);
        if (url.endsWith('/auth/refresh')) {
          refreshBodies.push(body);
          return tokenPair('a2');
        }
        return auth === 'Bearer a2'
          ? new Response('{}', { status: 200 })
          : unauthorized();
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await baseQueryWithReauth(
      { url: '/favorites' },
      makeApi(store),
      {},
    );

    // Ровно одна ротация, и БЕЗ тела — refresh адресуется cookie, не body.
    expect(refreshBodies).toHaveLength(1);
    expect(refreshBodies[0]).toBe('');
    // Свежий access осел в сторе, исходный запрос переигран успешно.
    expect(selectAccessToken(store.getState())).toBe('a2');
    expect(result.error).toBeUndefined();
  });

  it('обёртывает refresh в navigator.locks (очередь на весь origin)', async () => {
    const store = makeStore();
    store.dispatch(setCredentials({ access_token: 'a' }));

    const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb());
    vi.stubGlobal('navigator', { locks: { request } });

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const { url, auth } = await readRequest(input, init);
        if (url.endsWith('/auth/refresh')) return tokenPair('a2');
        return auth === 'Bearer a2'
          ? new Response('{}', { status: 200 })
          : unauthorized();
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    await baseQueryWithReauth({ url: '/favorites' }, makeApi(store), {});

    expect(request).toHaveBeenCalledWith(
      'avino.client.auth-refresh',
      expect.any(Function),
    );
  });
});
