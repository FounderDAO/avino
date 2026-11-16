/**
 * Тесты useViewportSearch — гео-приоритет Zillow: полигон > район/регион >
 * viewport; активация по жесту ('gesture') либо всегда ('always'); зеркало
 * bbox в URL (history.replaceState) при syncUrl.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useViewportSearch } from './useViewportSearch';
import type { LatLngBounds } from '@/lib/geo';
import type { Listing } from '@/lib/mock/types';

const listing = { id: 'l1' } as unknown as Listing;
const page = (listings: Listing[], total = listings.length) => ({ listings, total });
const trigger = vi.fn(() => ({ unwrap: () => Promise.resolve(page([listing])) }));
const cells = [{ lat: 39.66, lng: 66.93, count: 128 }];
const triggerClusters = vi.fn(() => ({ unwrap: () => Promise.resolve(cells) }));

vi.mock('@/store/api/searchApi', () => ({
  useLazySearchByBoundsQuery: () => [trigger, { isFetching: false }],
  useLazySearchClustersQuery: () => [triggerClusters, { isFetching: false }],
}));

const B: LatLngBounds = { swLat: 41.2, swLng: 69.1, neLat: 41.4, neLng: 69.4 };

beforeEach(() => {
  trigger.mockClear();
  triggerClusters.mockClear();
  window.history.replaceState(null, '', '/search?tx=SALE');
});

describe('useViewportSearch (gesture, /search)', () => {
  const opts = { mode: 'gesture' as const, filter: { tx: 'SALE' as const } };

  it('программный bounds до активации — игнор', () => {
    const { result } = renderHook(() => useViewportSearch(opts));
    act(() => result.current.handleBoundsChange(B, { user: false }));
    expect(trigger).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('жест пользователя активирует режим и грузит bounds-выдачу', async () => {
    const { result } = renderHook(() => useViewportSearch(opts));
    act(() => result.current.handleBoundsChange(B, { user: true }));
    expect(result.current.active).toBe(true);
    expect(trigger).toHaveBeenCalledWith({ bounds: B, filter: { tx: 'SALE' }, limit: 100 });
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
  });

  it('активный гео-фильтр глушит жест (Zillow boundary)', () => {
    const { result } = renderHook(() =>
      useViewportSearch({ ...opts, geoFilterActive: true }),
    );
    act(() => result.current.handleBoundsChange(B, { user: true }));
    expect(trigger).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  it('активный полигон глушит жест', () => {
    const { result } = renderHook(() =>
      useViewportSearch({ ...opts, polygonActive: true }),
    );
    act(() => result.current.handleBoundsChange(B, { user: true }));
    expect(trigger).not.toHaveBeenCalled();
  });

  it('initialBounds (SSR) — режим активен со старта', () => {
    const { result } = renderHook(() =>
      useViewportSearch({ ...opts, initialBounds: B }),
    );
    expect(result.current.active).toBe(true);
  });

  it('появление гео-фильтра деактивирует режим и чистит bbox из URL', async () => {
    window.history.replaceState(null, '', '/search?tx=SALE&sw_lat=41.2&sw_lng=69.1&ne_lat=41.4&ne_lng=69.4');
    const { result, rerender } = renderHook(
      (p: { geo: boolean }) =>
        useViewportSearch({ ...opts, syncUrl: true, initialBounds: B, geoFilterActive: p.geo }),
      { initialProps: { geo: false } },
    );
    expect(result.current.active).toBe(true);
    rerender({ geo: true });
    await waitFor(() => expect(result.current.active).toBe(false));
    expect(window.location.search).not.toContain('sw_lat');
  });

  it('syncUrl: успешный bounds-запрос пишет bbox в URL', async () => {
    const { result } = renderHook(() => useViewportSearch({ ...opts, syncUrl: true }));
    act(() => result.current.handleBoundsChange(B, { user: true }));
    await waitFor(() => expect(window.location.search).toContain('sw_lat=41.2'));
    expect(window.location.search).toContain('tx=SALE'); // фильтры не потеряны
  });

  it('смена фильтра при активном режиме перезапрашивает последнюю область', async () => {
    const { result, rerender } = renderHook(
      (p: { filter: { tx: 'SALE' | 'RENT' } }) =>
        useViewportSearch({ mode: 'gesture', filter: p.filter }),
      { initialProps: { filter: { tx: 'SALE' as 'SALE' | 'RENT' } } },
    );
    act(() => result.current.handleBoundsChange(B, { user: true }));
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
    trigger.mockClear();
    rerender({ filter: { tx: 'RENT' as const } });
    await waitFor(() =>
      expect(trigger).toHaveBeenCalledWith({ bounds: B, filter: { tx: 'RENT' }, limit: 100 }),
    );
  });
});

describe('useViewportSearch (always, /map)', () => {
  it('программный bounds тоже грузит выдачу (стартовый эмит /map)', async () => {
    const { result } = renderHook(() =>
      useViewportSearch({ mode: 'always', filter: {} }),
    );
    act(() => result.current.handleBoundsChange(B, { user: false }));
    expect(trigger).toHaveBeenCalled();
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
  });

  it('refetchLastBounds повторяет запрос по последней области (сброс территории)', async () => {
    const { result, rerender } = renderHook(
      (p: { poly: boolean }) =>
        useViewportSearch({ mode: 'always', filter: {}, polygonActive: p.poly }),
      { initialProps: { poly: false } },
    );
    act(() => result.current.handleBoundsChange(B, { user: false }));
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
    rerender({ poly: true });
    act(() => result.current.handleBoundsChange({ ...B, neLat: 41.5 }, { user: true }));
    trigger.mockClear();
    rerender({ poly: false });
    act(() => result.current.refetchLastBounds());
    expect(trigger).toHaveBeenCalledWith({
      bounds: { ...B, neLat: 41.5 },
      filter: {},
      limit: 100,
    });
  });

  it('устаревший ответ не перезаписывает свежий (гонка bounds-запросов)', async () => {
    type Page = ReturnType<typeof page>;
    let resolveFirst: (v: Page) => void = () => {};
    let resolveSecond: (v: Page) => void = () => {};
    const firstPromise = new Promise<Page>((res) => {
      resolveFirst = res;
    });
    const secondPromise = new Promise<Page>((res) => {
      resolveSecond = res;
    });
    trigger.mockImplementationOnce(() => ({ unwrap: () => firstPromise }));
    trigger.mockImplementationOnce(() => ({ unwrap: () => secondPromise }));

    const { result } = renderHook(() =>
      useViewportSearch({ mode: 'always', filter: {} }),
    );
    const B1 = B;
    const B2 = { ...B, neLat: 41.5 };
    act(() => result.current.handleBoundsChange(B1, { user: false }));
    act(() => result.current.handleBoundsChange(B2, { user: false }));

    // Резолвим в обратном порядке: сначала свежий (второй) запрос, потом устаревший (первый).
    await act(async () => {
      resolveSecond(page([{ id: 'fresh' } as unknown as Listing]));
      await secondPromise;
    });
    await act(async () => {
      resolveFirst(page([{ id: 'stale' } as unknown as Listing]));
      await firstPromise;
    });

    expect(result.current.listings).toEqual([{ id: 'fresh' }]);
  });

  it('в области больше объявлений, чем пинов, — грузит кластеры и общий счётчик', async () => {
    trigger.mockImplementationOnce(() => ({
      unwrap: () => Promise.resolve(page([listing], 732)),
    }));
    const { result } = renderHook(() => useViewportSearch({ mode: 'always', filter: {} }));
    act(() => result.current.handleBoundsChange(B, { user: false, zoom: 6 }));
    await waitFor(() => expect(result.current.clusters).toEqual(cells));
    expect(triggerClusters).toHaveBeenCalledWith({ bounds: B, zoom: 6, filter: {} });
    expect(result.current.total).toBe(732);
    expect(result.current.listings).toEqual([listing]);
  });

  it('все объявления области поместились в пины — кластеры не грузит', async () => {
    const { result } = renderHook(() => useViewportSearch({ mode: 'always', filter: {} }));
    act(() => result.current.handleBoundsChange(B, { user: false, zoom: 6 }));
    await waitFor(() => expect(result.current.listings).toEqual([listing]));
    expect(triggerClusters).not.toHaveBeenCalled();
    expect(result.current.clusters).toBe(null);
    expect(result.current.total).toBe(1);
  });

  it('близкий зум (≥16) — пины без кластеров, даже если объявлений больше', async () => {
    trigger.mockImplementationOnce(() => ({
      unwrap: () => Promise.resolve(page([listing], 500)),
    }));
    const { result } = renderHook(() => useViewportSearch({ mode: 'always', filter: {} }));
    act(() => result.current.handleBoundsChange(B, { user: false, zoom: 16 }));
    await waitFor(() => expect(result.current.total).toBe(500));
    expect(triggerClusters).not.toHaveBeenCalled();
    expect(result.current.clusters).toBe(null);
  });

  it('сбой кластеров — остаёмся на пинах', async () => {
    trigger.mockImplementationOnce(() => ({
      unwrap: () => Promise.resolve(page([listing], 732)),
    }));
    triggerClusters.mockImplementationOnce(() => ({
      unwrap: () => Promise.reject(new Error('500')),
    }));
    const { result } = renderHook(() => useViewportSearch({ mode: 'always', filter: {} }));
    act(() => result.current.handleBoundsChange(B, { user: false, zoom: 6 }));
    await waitFor(() => expect(result.current.total).toBe(732));
    expect(result.current.clusters).toBe(null);
    expect(result.current.listings).toEqual([listing]);
  });

  it('превью: openPreview/closePreview', () => {
    const { result } = renderHook(() => useViewportSearch({ mode: 'always', filter: {} }));
    act(() => result.current.openPreview('l9'));
    expect(result.current.previewId).toBe('l9');
    act(() => result.current.closePreview());
    expect(result.current.previewId).toBe(null);
  });
});
