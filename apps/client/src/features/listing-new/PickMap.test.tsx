/**
 * PickMap — тест гонки обратных геокодов: при быстрых кликах по карте
 * применяется только результат ПОСЛЕДНЕЙ точки.
 *
 * Реальный Yandex SDK в jsdom недоступен, поэтому `useYmaps` отдаёт минимальный
 * фейк (Map/Placemark с событиями), а `reverseGeocodeDetailed` — управляемые
 * промисы, которые тест резолвит в нужном порядке.
 */
import * as React from 'react';
import { act, render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReverseGeocodeResult } from '@/features/map/geocode';

type Handler = (e: { get: (k: string) => unknown }) => void;

/** Обработчики событий фейковой карты (click). */
let mapHandlers: Record<string, Handler> = {};

class FakeMap {
  events = {
    add: (name: string, fn: Handler) => {
      mapHandlers[name] = fn;
    },
  };
  geoObjects = { add: vi.fn() };
  setCenter = vi.fn();
  destroy = vi.fn();
}

class FakePlacemark {
  private coords: [number, number];
  constructor(coords: [number, number]) {
    this.coords = coords;
  }
  events = { add: vi.fn() };
  geometry = {
    getCoordinates: () => this.coords,
    setCoordinates: (c: [number, number]) => {
      this.coords = c;
    },
  };
}

const fakeYmaps = { Map: FakeMap, Placemark: FakePlacemark };

vi.mock('@/features/map/useYmaps', () => ({
  useYmaps: () => ({ ymaps: fakeYmaps, status: 'ready' }),
}));

/** Отложенные ответы геокодера — по одному на вызов, в порядке кликов. */
let pending: Array<(r: ReverseGeocodeResult | null) => void> = [];
vi.mock('@/features/map/geocode', () => ({
  reverseGeocodeDetailed: () =>
    new Promise<ReverseGeocodeResult | null>((resolve) => {
      pending.push(resolve);
    }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { PickMap } from './PickMap';

const click = (coords: [number, number]) =>
  act(() => mapHandlers.click({ get: () => coords }));

const result = (address: string): ReverseGeocodeResult => ({
  address,
  components: [{ kind: 'province', name: address }],
});

beforeEach(() => {
  mapHandlers = {};
  pending = [];
});

describe('PickMap', () => {
  it('клик по карте: координаты сразу, адрес и компоненты — после обратного геокода', async () => {
    const onChange = vi.fn();
    const onAddressResolve = vi.fn();
    const onLocationResolve = vi.fn();
    render(
      <PickMap
        value={null}
        onChange={onChange}
        onAddressResolve={onAddressResolve}
        onLocationResolve={onLocationResolve}
      />,
    );

    click([41.3, 69.2]);
    expect(onChange).toHaveBeenCalledWith([41.3, 69.2]);
    expect(onAddressResolve).not.toHaveBeenCalled();

    await act(async () => pending[0](result('Ташкент')));
    expect(onAddressResolve).toHaveBeenCalledWith('Ташкент');
    expect(onLocationResolve).toHaveBeenCalledWith(result('Ташкент'));
  });

  it('быстрые клики: применяется только последний результат, даже если ответы пришли вразнобой', async () => {
    const onAddressResolve = vi.fn();
    const onLocationResolve = vi.fn();
    render(
      <PickMap
        value={null}
        onChange={() => {}}
        onAddressResolve={onAddressResolve}
        onLocationResolve={onLocationResolve}
      />,
    );

    click([41.1, 69.1]);
    click([41.2, 69.2]);
    click([41.3, 69.3]);
    expect(pending).toHaveLength(3);

    // Ответ по последней точке приходит первым, устаревшие — позже.
    await act(async () => pending[2](result('третий')));
    await act(async () => pending[0](result('первый')));
    await act(async () => pending[1](result('второй')));

    expect(onAddressResolve).toHaveBeenCalledTimes(1);
    expect(onAddressResolve).toHaveBeenCalledWith('третий');
    expect(onLocationResolve).toHaveBeenCalledTimes(1);
    expect(onLocationResolve).toHaveBeenCalledWith(result('третий'));
  });

  it('устаревший ответ, пришедший раньше актуального, не применяется', async () => {
    const onAddressResolve = vi.fn();
    render(<PickMap value={null} onChange={() => {}} onAddressResolve={onAddressResolve} />);

    click([41.1, 69.1]);
    click([41.2, 69.2]);

    await act(async () => pending[0](result('старый')));
    expect(onAddressResolve).not.toHaveBeenCalled();

    await act(async () => pending[1](result('новый')));
    expect(onAddressResolve).toHaveBeenCalledTimes(1);
    expect(onAddressResolve).toHaveBeenCalledWith('новый');
  });

  it('точку сменили извне (подсказка адреса) → ответ по прежнему клику отбрасывается', async () => {
    const onAddressResolve = vi.fn();
    const props = { onChange: () => {}, onAddressResolve };
    const { rerender } = render(<PickMap value={null} {...props} />);

    click([41.1, 69.1]);
    // Родитель получил точку клика, затем пользователь выбрал подсказку адреса.
    rerender(<PickMap value={[41.1, 69.1]} {...props} />);
    rerender(<PickMap value={[41.5, 69.5]} {...props} />);

    await act(async () => pending[0](result('адрес старого клика')));
    expect(onAddressResolve).not.toHaveBeenCalled();
  });
});
