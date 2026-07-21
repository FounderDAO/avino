import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

/**
 * Профиль пользователя, отдаваемый мок-стором. По умолчанию — полный
 * (Имя/Фамилия/Телефон заполнены), т.к. большинство тестов этого файла
 * проверяют шаги визарда, а не гейт контактных данных (ADR-0125).
 * Отдельные тесты переопределяют перед рендером.
 */
let mockUser: unknown = {
  phone: '+998901234567',
  profile: {
    first_name: 'Ali',
    last_name: 'Valiev',
    contact_phone: '+998901234567',
  },
};

beforeEach(() => {
  mockUser = {
    phone: '+998901234567',
    profile: {
      first_name: 'Ali',
      last_name: 'Valiev',
      contact_phone: '+998901234567',
    },
  };
});

vi.mock('@/store/hooks', () => ({
  useAppSelector: (sel: unknown) =>
    (sel as (s: unknown) => unknown)({
      auth: {
        accessToken: 'token',
        refreshToken: 'token',
        user: mockUser,
        status: 'authenticated',
      },
    }),
}));
/**
 * Ошибка createListing (error-envelope РТК Query), подставляемая в мок ниже.
 * По умолчанию undefined (успех); тесты лимита переопределяют перед рендером.
 * Каждый тест ставит НОВЫЙ объект — эффект открытия модалки в ListingNew
 * завязан на identity `createError`, чтобы повторный сабмит с тем же кодом
 * тоже открывал модалку (не только сменой code).
 */
let mockCreateError: unknown = undefined;

beforeEach(() => {
  mockCreateError = undefined;
});

vi.mock('@/store/api/createListingApi', () => ({
  useCreateListingMutation: () => [
    vi.fn(),
    { isLoading: false, error: mockCreateError },
  ],
  useUploadListingMediaMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('@/store/api/publicSettingsApi', () => ({
  useGetPublicSettingsQuery: () => ({
    data: { activeListingLimit: 3 },
    isLoading: false,
  }),
}));
vi.mock('@/store/api/usersApi', () => ({
  useUpdateProfileMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('@/store/api/amenitiesApi', () => ({
  useListAmenitiesQuery: () => ({ data: [], isLoading: false }),
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
  AddressStep: ({
    onAddressChange,
  }: {
    onAddressChange: (v: string) => void;
  }) => (
    <button
      type="button"
      data-testid="fill-address"
      onClick={() => onAddressChange('ул. Тестовая, 1')}
    >
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
      onClick={() =>
        onChange({ regionId: 'region-1', districtId: 'district-1' })
      }
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
        .reduce(
          (o: any, k: string) =>
            o && typeof o === 'object' ? o[k] : undefined,
          root,
        );
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

  it('(в) авторизован, профиль неполный → гейт «Контактные данные» вместо шагов визарда (ADR-0125)', () => {
    mockUser = {
      phone: null,
      profile: { first_name: null, last_name: null, contact_phone: null },
    };
    render(<ListingNew {...emptyProps} />);

    expect(screen.getByText('Контактные данные')).toBeInTheDocument();
    // Шаги визарда (прогресс-бар, кнопка «Далее») не рендерятся.
    expect(screen.queryByRole('button', { name: /далее/i })).toBeNull();
    expect(screen.queryByText('Тип сделки')).toBeNull();
  });

  it('(в) авторизован, профиль полный → рендерится шаг 1 визарда', () => {
    render(<ListingNew {...emptyProps} />);

    expect(screen.queryByText('Контактные данные')).toBeNull();
    expect(screen.getByText('Тип сделки')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /далее/i })).toBeInTheDocument();
  });

  it('(г) 422 ACTIVE_LISTING_LIMIT_REACHED от createListing → открывает LimitReachedModal', () => {
    mockCreateError = {
      status: 422,
      data: {
        error: {
          code: 'ACTIVE_LISTING_LIMIT_REACHED',
          message: 'limit reached',
        },
      },
    };
    render(<ListingNew {...emptyProps} />);
    expect(screen.getByText('Достигнут лимит объявлений')).toBeInTheDocument();
  });

  it('(г) другой код ошибки createListing → LimitReachedModal не открывается', () => {
    mockCreateError = {
      status: 400,
      data: { error: { code: 'VALIDATION_ERROR', message: 'bad request' } },
    };
    render(<ListingNew {...emptyProps} />);
    expect(screen.queryByText('Достигнут лимит объявлений')).toBeNull();
  });

  it('(г) повторный сабмит с тем же кодом (новый объект ошибки) снова открывает модалку', () => {
    mockCreateError = {
      status: 422,
      data: {
        error: {
          code: 'ACTIVE_LISTING_LIMIT_REACHED',
          message: 'limit reached',
        },
      },
    };
    const { rerender } = render(<ListingNew {...emptyProps} />);
    expect(screen.getByText('Достигнут лимит объявлений')).toBeInTheDocument();

    // Закрываем модалку — она должна пропасть.
    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.queryByText('Достигнут лимит объявлений')).toBeNull();

    // Повторный сабмит: новый объект ошибки с тем же кодом должен снова открыть модалку.
    mockCreateError = {
      status: 422,
      data: {
        error: {
          code: 'ACTIVE_LISTING_LIMIT_REACHED',
          message: 'limit reached',
        },
      },
    };
    rerender(<ListingNew {...emptyProps} />);
    expect(screen.getByText('Достигнут лимит объявлений')).toBeInTheDocument();
  });
});
