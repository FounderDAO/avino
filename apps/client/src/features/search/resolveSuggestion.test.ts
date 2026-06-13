import { describe, it, expect, vi } from 'vitest';

const geocode = vi.fn();
vi.mock('@/features/map/useYmaps', () => ({
  loadYmaps: () => Promise.resolve({ geocode }),
}));

import { resolveSuggestion } from './resolveSuggestion';

function fakeGeoObject(boundedBy: unknown, addressLine: string) {
  return {
    geoObjects: {
      get: (i: number) =>
        i === 0
          ? {
              properties: { get: (k: string) => (k === 'boundedBy' ? boundedBy : undefined) },
              getAddressLine: () => addressLine,
            }
          : null,
    },
  };
}

describe('resolveSuggestion', () => {
  it('геокодит значение → circle из boundedBy', async () => {
    geocode.mockResolvedValue(
      fakeGeoObject([[41.30, 69.24], [41.31, 69.25]], 'Ташкент, Юнусабадский район'),
    );
    const r = await resolveSuggestion('Ташкент, Юнусабадский');
    expect(r).not.toBeNull();
    expect(r!.label).toBe('Ташкент, Юнусабадский район');
    expect(r!.circle.lat).toBeCloseTo(41.305, 5);
    expect(r!.circle.radiusM).toBeGreaterThan(0);
  });

  it('нет geoObject → null', async () => {
    geocode.mockResolvedValue({ geoObjects: { get: () => null } });
    expect(await resolveSuggestion('???')).toBeNull();
  });

  it('нет boundedBy → null', async () => {
    geocode.mockResolvedValue(fakeGeoObject(undefined, 'X'));
    expect(await resolveSuggestion('X')).toBeNull();
  });

  it('geocode бросил → null (деградация)', async () => {
    geocode.mockRejectedValue(new Error('network'));
    expect(await resolveSuggestion('X')).toBeNull();
  });
});
