import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { createApi } from '@reduxjs/toolkit/query';
import { apiErrorToastMiddleware } from './apiErrorToastMiddleware';
import { subscribeApiErrors, type ApiErrorEvent } from '@/lib/apiErrorToastBus';

/** BaseQuery, всегда падающий унифицированным error-envelope API. */
const failingBaseQuery = async () => ({
  error: {
    status: 500,
    data: { error: { code: 'INTERNAL', message: 'boom', request_id: 'r-1' } },
  },
});

const testApi = createApi({
  reducerPath: 'testApi',
  baseQuery: failingBaseQuery,
  endpoints: (build) => ({
    // Обычная мутация — должна эмитить событие.
    doThing: build.mutation<void, void>({ query: () => 'x' }),
    // Имя из SUPPRESSED_ENDPOINTS — событие подавляется.
    logout: build.mutation<void, void>({ query: () => 'x' }),
    // Query — не тостим вообще.
    getThing: build.query<void, void>({ query: () => 'x' }),
  }),
});

function makeStore() {
  return configureStore({
    reducer: { [testApi.reducerPath]: testApi.reducer },
    middleware: (gdm) => gdm().concat(testApi.middleware, apiErrorToastMiddleware),
  });
}

describe('apiErrorToastMiddleware', () => {
  let events: ApiErrorEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    events = [];
    unsubscribe?.();
    unsubscribe = subscribeApiErrors((e) => events.push(e));
  });

  it('эмитит событие для упавшей мутации', async () => {
    const store = makeStore();
    await store.dispatch(testApi.endpoints.doThing.initiate());
    expect(events).toHaveLength(1);
    expect(events[0].endpointName).toBe('doThing');
    expect(events[0].error).toMatchObject({
      data: { error: { code: 'INTERNAL' } },
    });
  });

  it('не эмитит для эндпоинта из suppress-list', async () => {
    const store = makeStore();
    await store.dispatch(testApi.endpoints.logout.initiate());
    expect(events).toHaveLength(0);
  });

  it('не эмитит для упавшего query', async () => {
    const store = makeStore();
    await store.dispatch(testApi.endpoints.getThing.initiate());
    expect(events).toHaveLength(0);
  });
});
