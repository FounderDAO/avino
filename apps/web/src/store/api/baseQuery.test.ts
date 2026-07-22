/**
 * baseQueryWithReauth (admin) — авто-refresh по httpOnly cookie (ADR-0153,
 * TASK-256 PR-3).
 *
 * refresh уехал в cookie `avino_rt`: на 401 клиент дёргает `/auth/refresh` БЕЗ
 * ТЕЛА (сервер ротирует по cookie), кладёт свежий access (setTokens) и
 * переигрывает исходный запрос. Web Locks сериализует refresh между вкладками
 * (иначе оба таба предъявили бы один cookie-токен → TOKEN_REUSED). Node-env,
 * поэтому navigator стабаем вручную.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeStore } from '../store';
import { baseQueryWithReauth } from './baseQuery';
import { setTokens, selectAccessToken } from '../slices/authSlice';

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

describe('baseQueryWithReauth (admin): refresh по cookie (ADR-0153)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('на 401 ротирует БЕЗ тела (сервер читает cookie), кладёт access и переигрывает запрос', async () => {
    const store = makeStore();
    store.dispatch(setTokens({ access_token: 'a' }));

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
      { url: '/admin/users' },
      makeApi(store),
      {},
    );

    expect(refreshBodies).toHaveLength(1);
    expect(refreshBodies[0]).toBe(''); // без тела — refresh адресуется cookie
    expect(selectAccessToken(store.getState())).toBe('a2');
    expect(result.error).toBeUndefined();
  });

  it('обёртывает refresh в navigator.locks (очередь на весь origin)', async () => {
    const store = makeStore();
    store.dispatch(setTokens({ access_token: 'a' }));

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

    await baseQueryWithReauth({ url: '/admin/users' }, makeApi(store), {});

    expect(request).toHaveBeenCalledWith(
      'avino.admin.auth-refresh',
      expect.any(Function),
    );
  });
});
