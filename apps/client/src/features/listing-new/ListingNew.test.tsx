import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/createListingApi', () => ({
  useCreateListingMutation: () => [vi.fn(), { isLoading: false }],
  useUploadListingMediaMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
/**
 * AddressStep — мок с кнопкой для установки адреса в форме (нужно для теста
 * валидации шага 2, который требует непустого address).
 */
vi.mock('./AddressStep', () => ({
  AddressStep: ({ onAddressChange }: { onAddressChange: (v: string) => void }) => (
    <button type="button" data-testid="fill-address" onClick={() => onAddressChange('ул. Тестовая, 1')}>
      fill-address
    </button>
  ),
}));
/**
 * RegionDistrictSelect — мок с кнопкой, имитирующей выбор региона и района.
 */
vi.mock('./RegionDistrictSelect', () => ({
  RegionDistrictSelect: ({
    onChange,
  }: {
    onChange: (v: { regionId?: string; districtId?: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="fill-region"
      onClick={() => onChange({ regionId: 'region-1', districtId: 'district-1' })}
    >
      fill-region
    </button>
  ),
}));
vi.mock('@/components/layout/LoginModal', () => ({ LoginModal: () => null }));
vi.mock('next-intl', () => {
  const resolve =
    (ns: string) =>
    (key: string): string => {
      const root = (ns ? (ru as any)[ns] : ru) as any;
      const val = key
        .split('.')
        .reduce((o: any, k: string) => (o && typeof o === 'object' ? o[k] : undefined), root);
      return typeof val === 'string' ? val : key;
    };
  return { useTranslations: resolve, useLocale: () => 'ru' };
});

import { ListingNew, buildListingBody } from './ListingNew';
import type { FormState } from './ListingNew';

const emptyProps = { regions: [], districts: [] };

describe('ListingNew wizard (variant B)', () => {
  it('прогресс-бар не содержит шаг «Контакты», но содержит «Описание» и «Превью»', () => {
    render(<ListingNew {...emptyProps} />);
    expect(screen.queryByText('Контакты')).toBeNull();
    expect(screen.getByText('Описание')).toBeInTheDocument();
    expect(screen.getByText('Превью')).toBeInTheDocument();
  });

  it('(а) шаг 2 невалиден без regionId/districtId — кнопка «Далее» задизаблена', () => {
    render(<ListingNew {...emptyProps} />);

    // Шаг 1 валиден по умолчанию (SALE + APARTMENT); переходим на шаг 2.
    const nextBtn = screen.getByRole('button', { name: /далее/i });
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    // Шаг 2: адрес и регион пустые → кнопка «Далее» задизаблена.
    const nextBtn2 = screen.getByRole('button', { name: /далее/i });
    expect(nextBtn2).toBeDisabled();

    // Заполняем адрес, но регион/район ещё не выбраны → всё ещё задизаблена.
    fireEvent.click(screen.getByTestId('fill-address'));
    expect(nextBtn2).toBeDisabled();

    // Выбираем регион и район — теперь кнопка должна стать активной.
    fireEvent.click(screen.getByTestId('fill-region'));
    expect(nextBtn2).not.toBeDisabled();
  });

  it('(б) buildListingBody проставляет district_id и city_id из regionId/districtId', () => {
    const base: FormState = {
      tx: 'SALE',
      type: 'APARTMENT',
      address: 'ул. Тестовая, 1',
      coords: null,
      regionId: 'region-uuid',
      districtId: 'district-uuid',
      rooms: '2',
      bathrooms: '',
      parking: '',
      area: '60',
      lotArea: '',
      livingArea: '',
      nonLivingArea: '',
      floor: '',
      isBasement: false,
      totalFloors: '',
      year: '',
      price: '100000',
      currency: 'USD',
      photos: [],
      lang: 'RU',
      title: 'Тест',
      desc: '',
      toursEnabled: false,
      tourWindows: [],
      amenities: [],
    };

    const body = buildListingBody(base, false /* noRooms */);

    expect(body.district_id).toBe('district-uuid');
    expect(body.city_id).toBe('region-uuid');
  });

  it('(б) buildListingBody не проставляет district_id/city_id когда они пустые', () => {
    const base: FormState = {
      tx: 'SALE',
      type: 'APARTMENT',
      address: '',
      coords: null,
      regionId: '',
      districtId: '',
      rooms: '2',
      bathrooms: '',
      parking: '',
      area: '60',
      lotArea: '',
      livingArea: '',
      nonLivingArea: '',
      floor: '',
      isBasement: false,
      totalFloors: '',
      year: '',
      price: '100000',
      currency: 'USD',
      photos: [],
      lang: 'RU',
      title: 'Тест',
      desc: '',
      toursEnabled: false,
      tourWindows: [],
      amenities: [],
    };

    const body = buildListingBody(base, false);

    expect(body.district_id).toBeUndefined();
    expect(body.city_id).toBeUndefined();
  });
});
