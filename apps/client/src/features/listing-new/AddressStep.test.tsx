/**
 * AddressStep — тесты проводки «карта → регион/район» и подавления фокуса карты.
 *
 * Стратегия: PickMap замокан (реальной Yandex-карты в jsdom нет) — мок отдаёт
 * наружу свои пропсы, тест сам дёргает `onLocationResolve` компонентами адреса в
 * форме Yandex. Геокодер (`geocodeToPoint`) — шпион: по нему видно, перецентровывал
 * ли эффект карту.
 */
import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';
import type { PickMapProps } from './PickMap';
import type { District, Region } from '@/lib/mock/types';

const geocodeToPoint = vi.fn();
vi.mock('@/features/map/geocode', () => ({
  geocodeToPoint: (...args: unknown[]) => geocodeToPoint(...args),
}));

/** Последние пропсы, с которыми отрендерен PickMap. */
let pickMapProps: PickMapProps | null = null;
vi.mock('./PickMap', () => ({
  PickMap: (props: PickMapProps) => {
    pickMapProps = props;
    return <div data-testid="pick-map" />;
  },
}));

vi.mock('@/features/search/useGeoSuggest', () => ({
  useGeoSuggest: () => ({ items: [], loading: false }),
}));

vi.mock('next-intl', () => {
  const resolve = (ns: string) => (key: string): string => {
    const root = (ru as Record<string, unknown>)[ns];
    const val = key
      .split('.')
      .reduce(
        (o: unknown, k: string) =>
          o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined,
        root,
      );
    return typeof val === 'string' ? val : key;
  };
  return { useTranslations: resolve, useLocale: () => 'ru' };
});

import { AddressStep } from './AddressStep';

// ── Справочник (названия — как в реальном, ru) ────────────────────────────────

const REGIONS: Region[] = [
  { id: 'city', name: 'город Ташкент', code: 'toshkent-shahri' },
  { id: 'obl', name: 'Ташкентская область', code: 'toshkent' },
];
const DISTRICTS: District[] = [
  { id: 'yun', name: 'Юнусабад', regionId: 'city' },
  { id: 'chil', name: 'Чиланзар', regionId: 'city' },
  { id: 'qib', name: 'Кибрайский район', regionId: 'obl' },
];

const tashkent = (district: string) => ({
  address: `Ташкент, ${district}, улица Амира Темура, 12`,
  components: [
    { kind: 'country', name: 'Узбекистан' },
    { kind: 'province', name: 'Ташкент' },
    { kind: 'locality', name: 'Ташкент' },
    { kind: 'district', name: district },
  ],
});

/**
 * Обёртка-«родитель»: держит регион/район в стейте, как ListingNew, и считает
 * имена тем же способом — чтобы эффект фокуса в AddressStep срабатывал как в
 * реальной форме.
 */
function Harness({
  initial = {},
  onLocation,
}: {
  initial?: { regionId?: string; districtId?: string };
  onLocation?: (next: { regionId: string; districtId?: string }) => void;
}) {
  const [sel, setSel] = React.useState(initial);
  const [address, setAddress] = React.useState('');
  return (
    <>
      <button type="button" data-testid="pick-chil" onClick={() => setSel({ regionId: 'city', districtId: 'chil' })}>
        pick
      </button>
      <span data-testid="sel">{`${sel.regionId ?? ''}|${sel.districtId ?? ''}`}</span>
      <AddressStep
        address={address}
        coords={null}
        onAddressChange={setAddress}
        onCoordsChange={() => {}}
        regionName={REGIONS.find((r) => r.id === sel.regionId)?.name}
        districtName={DISTRICTS.find((d) => d.id === sel.districtId)?.name}
        locale="ru"
        regions={REGIONS}
        districts={DISTRICTS}
        regionId={sel.regionId}
        districtId={sel.districtId}
        onLocationFromMap={(next) => {
          onLocation?.(next);
          setSel(next);
        }}
      />
    </>
  );
}

beforeEach(() => {
  pickMapProps = null;
  geocodeToPoint.mockReset();
  geocodeToPoint.mockResolvedValue(null);
});

describe('AddressStep', () => {
  it('точка на карте → регион и район из компонент адреса Yandex', () => {
    const onLocation = vi.fn();
    render(<Harness onLocation={onLocation} />);

    act(() => pickMapProps!.onLocationResolve!(tashkent('Юнусабадский район')));

    expect(onLocation).toHaveBeenCalledWith({ regionId: 'city', districtId: 'yun' });
    expect(screen.getByTestId('sel')).toHaveTextContent('city|yun');
  });

  it('регион/район от карты НЕ перецентровывают карту (геокод названия не вызывается)', () => {
    render(<Harness />);
    expect(geocodeToPoint).not.toHaveBeenCalled();

    act(() => pickMapProps!.onLocationResolve!(tashkent('Юнусабадский район')));

    expect(screen.getByTestId('sel')).toHaveTextContent('city|yun');
    expect(geocodeToPoint).not.toHaveBeenCalled();
  });

  it('после карты ручная смена района снова центрирует карту (подавление не «залипает»)', () => {
    render(<Harness />);
    act(() => pickMapProps!.onLocationResolve!(tashkent('Юнусабадский район')));
    expect(geocodeToPoint).not.toHaveBeenCalled();

    act(() => screen.getByTestId('pick-chil').click());

    expect(geocodeToPoint).toHaveBeenCalledTimes(1);
    expect(geocodeToPoint).toHaveBeenCalledWith('город Ташкент, Чиланзар', 'ru');
  });

  it('карта вернула уже выбранные регион/район → ничего не меняем, следующая ручная смена работает', () => {
    const onLocation = vi.fn();
    render(<Harness initial={{ regionId: 'city', districtId: 'yun' }} onLocation={onLocation} />);
    // Монтирование с выбранным регионом (без точки) центрирует карту один раз.
    expect(geocodeToPoint).toHaveBeenCalledTimes(1);

    act(() => pickMapProps!.onLocationResolve!(tashkent('Юнусабадский район')));
    expect(onLocation).not.toHaveBeenCalled();

    act(() => screen.getByTestId('pick-chil').click());
    expect(geocodeToPoint).toHaveBeenCalledTimes(2);
  });

  it('район не распознан, регион тот же → выбранный район не сбрасывается', () => {
    const onLocation = vi.fn();
    render(<Harness initial={{ regionId: 'city', districtId: 'yun' }} onLocation={onLocation} />);

    act(() => pickMapProps!.onLocationResolve!(tashkent('Неизвестный район')));

    expect(onLocation).not.toHaveBeenCalled();
    expect(screen.getByTestId('sel')).toHaveTextContent('city|yun');
  });

  it('другой регион без распознанного района → регион меняется, район сбрасывается', () => {
    render(<Harness initial={{ regionId: 'city', districtId: 'yun' }} />);

    act(() =>
      pickMapProps!.onLocationResolve!({
        address: 'Ташкентская область, село',
        components: [
          { kind: 'province', name: 'Ташкентская область' },
          { kind: 'area', name: 'Неизвестный район' },
        ],
      }),
    );

    expect(screen.getByTestId('sel')).toHaveTextContent('obl|');
  });

  it('ничего не распознано → выбор пользователя не трогаем', () => {
    const onLocation = vi.fn();
    render(<Harness initial={{ regionId: 'city', districtId: 'yun' }} onLocation={onLocation} />);

    act(() =>
      pickMapProps!.onLocationResolve!({
        address: 'Казахстан, Шымкент',
        components: [{ kind: 'province', name: 'Туркестанская область' }],
      }),
    );

    expect(onLocation).not.toHaveBeenCalled();
    expect(screen.getByTestId('sel')).toHaveTextContent('city|yun');
  });

  it('без справочников (страница редактирования) карта отдаёт только адрес', () => {
    const onAddressChange = vi.fn();
    render(
      <AddressStep
        address="ул. Сохранённая, 5"
        coords={[41.3, 69.2]}
        onAddressChange={onAddressChange}
        onCoordsChange={() => {}}
        regionName="город Ташкент"
        districtName="Юнусабад"
        locale="ru"
      />,
    );
    // Монтирование с сохранённой точкой: адрес не трогаем, карту не дёргаем.
    expect(onAddressChange).not.toHaveBeenCalled();
    expect(geocodeToPoint).not.toHaveBeenCalled();
    // Обратный геокод по-прежнему идёт прямо в onAddressChange.
    expect(pickMapProps!.onAddressResolve).toBe(onAddressChange);
    expect(() =>
      act(() => pickMapProps!.onLocationResolve!(tashkent('Чиланзарский район'))),
    ).not.toThrow();
  });

  it('required + addressError: звёздочка, aria-invalid и текст ошибки вместо подсказки', () => {
    const { rerender } = render(
      <AddressStep address="" coords={null} onAddressChange={() => {}} onCoordsChange={() => {}} locale="ru" />,
    );
    const input = () => screen.getByRole('combobox');
    expect(screen.queryByText('*')).toBeNull();
    expect(input()).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText(ru.listingNew.fields.address.hint)).toBeInTheDocument();

    rerender(
      <AddressStep
        address=""
        coords={null}
        onAddressChange={() => {}}
        onCoordsChange={() => {}}
        locale="ru"
        required
        addressError="Обязательное поле"
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAttribute('aria-required', 'true');
    const msg = screen.getByText('Обязательное поле');
    expect(input()).toHaveAttribute('aria-describedby', msg.id);
    expect(input().className).toContain('border-red');
  });
});
