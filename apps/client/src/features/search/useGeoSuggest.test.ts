import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { District } from '@/lib/mock/types';

const suggest = vi.fn();
vi.mock('@/features/map/useYmaps', () => ({
  loadYmaps: () => Promise.resolve({ suggest }),
}));

import { useGeoSuggest } from './useGeoSuggest';

const districts: District[] = [
  { id: 'yunusabad', name: 'Юнусабадский', count: 0, aliases: ['Yunusobod', 'Yunusabad'] },
  { id: 'chilanzar', name: 'Чиланзарский', count: 0, aliases: ['Chilonzor', 'Chilanzar'] },
];

beforeEach(() => {
  vi.useFakeTimers();
  suggest.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useGeoSuggest', () => {
  it('ниже порога (1 символ) — пусто, suggest не зовётся', async () => {
    const { result } = renderHook(() =>
      useGeoSuggest('Ю', { enabled: true, districts, locale: 'ru' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(result.current.items).toEqual([]);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('мёржит локальные районы (сверху) и адреса Yandex', async () => {
    suggest.mockResolvedValue([
      { displayName: 'Юнусабад, ул. Амира Темура', value: 'Узбекистан, Ташкент, Амира Темура' },
    ]);
    const { result } = renderHook(() =>
      useGeoSuggest('Юну', { enabled: true, districts, locale: 'ru' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(result.current.items.length).toBe(2));
    expect(result.current.items[0]).toMatchObject({ kind: 'district', title: 'Юнусабадский' });
    expect(result.current.items[1]).toMatchObject({ kind: 'geo' });
  });

  it('деградация: если suggest упал — остаются только районы', async () => {
    suggest.mockRejectedValue(new Error('no key'));
    const { result } = renderHook(() =>
      useGeoSuggest('Чил', { enabled: true, districts, locale: 'ru' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(result.current.items.length).toBe(1));
    expect(result.current.items[0]).toMatchObject({ kind: 'district', title: 'Чиланзарский' });
  });

  it('матчит район по узбекскому/латинскому алиасу (ввод латиницей)', async () => {
    suggest.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useGeoSuggest('yunusobod', { enabled: true, districts, locale: 'uz' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(result.current.items.length).toBeGreaterThan(0));
    expect(result.current.items[0]).toMatchObject({ kind: 'district', title: 'Юнусабадский' });
  });

  it('enabled=false — пусто', async () => {
    const { result } = renderHook(() =>
      useGeoSuggest('Юну', { enabled: false, districts, locale: 'ru' }),
    );
    await vi.advanceTimersByTimeAsync(400);
    expect(result.current.items).toEqual([]);
    expect(suggest).not.toHaveBeenCalled();
  });
});
