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
const trigger = vi.fn(() => ({ unwrap: () => Promise.resolve([listing]) }));

vi.mock('@/store/api/searchApi', () => ({
  useLazySearchByBoundsQuery: () => [trigger, { isFetching: false }],
}));

const B: LatLngBounds = { swLat: 41.2, swLng: 69.1, neLat: 41.4, neLng: 69.4 };

beforeEach(() => {
  trigger.mockClear();
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

  it('превью: openPreview/closePreview', () => {
    const { result } = renderHook(() => useViewportSearch({ mode: 'always', filter: {} }));
    act(() => result.current.openPreview('l9'));
    expect(result.current.previewId).toBe('l9');
    act(() => result.current.closePreview());
    expect(result.current.previewId).toBe(null);
  });
});
