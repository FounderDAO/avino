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
// Квота активных объявлений (проактивный agent-gate). По умолчанию — не на
// лимите (blocked:false), тесты блока переопределяют перед render.
let mockQuota: unknown = {
  data: { used: 0, limit: 3, blocked: false },
  isLoading: false,
};
beforeEach(() => {
  mockQuota = { data: { used: 0, limit: 3, blocked: false }, isLoading: false };
});
vi.mock('@/store/api/listingsQuotaApi', () => ({
  useGetListingQuotaQuery: () => mockQuota,
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
 * AddressStep — мок: показывает текущий адрес и ошибку поля, кнопки имитируют
 * ввод пользователя, очистку и ответ карты (адрес + регион/район от точки).
 */
vi.mock('./AddressStep', () => ({
  AddressStep: ({
    address,
    addressError,
    required,
    onAddressChange,
    onLocationFromMap,
  }: {
    address: string;
    addressError?: string;
    required?: boolean;
    onAddressChange: (v: string) => void;
    onLocationFromMap?: (v: { regionId: string; districtId?: string }) => void;
  }) => (
    <div>
      <span data-testid="address-value">{address}</span>
      <span data-testid="address-required">{String(Boolean(required))}</span>
      {addressError && <span data-testid="address-error">{addressError}</span>}
      <button
        type="button"
        data-testid="fill-address"
        onClick={() => onAddressChange('ул. Тестовая, 1')}
      >
        fill-address
      </button>
      <button
        type="button"
        data-testid="clear-address"
        onClick={() => onAddressChange('')}
      >
        clear-address
      </button>
      <button
        type="button"
        data-testid="map-pick"
        onClick={() => {
          // Порядок как в PickMap: сначала адрес, затем регион/район.
          onAddressChange('Ташкент, улица Амира Темура, 12');
          onLocationFromMap?.({ regionId: 'region-2', districtId: 'district-3' });
        }}
      >
        map-pick
      </button>
    </div>
  ),
}));
/**
 * RegionDistrictSelect — мок: кнопки имитируют выбор региона/района, а
 * полученные ошибки и текущий выбор рендерятся для проверок.
 */
vi.mock('./RegionDistrictSelect', () => ({
  RegionDistrictSelect: ({
    onChange,
    regionId,
    districtId,
    required,
    regionError,
    districtError,
  }: {
    onChange: (v: { regionId?: string; districtId?: string }) => void;
    regionId?: string;
    districtId?: string;
    required?: boolean;
    regionError?: string;
    districtError?: string;
  }) => (
    <div>
      <span data-testid="select-value">{`${regionId ?? ''}|${districtId ?? ''}`}</span>
      <span data-testid="select-required">{String(Boolean(required))}</span>
      {regionError && <span data-testid="region-error">{regionError}</span>}
      {districtError && <span data-testid="district-error">{districtError}</span>}
      <button
        type="button"
        data-testid="fill-region-only"
        onClick={() => onChange({ regionId: 'region-1', districtId: undefined })}
      >
        fill-region-only
      </button>
      <button
        type="button"
        data-testid="fill-region"
        onClick={() =>
          onChange({ regionId: 'region-1', districtId: 'district-1' })
        }
      >
        fill-region
      </button>
      <button
        type="button"
        data-testid="fill-district-2"
        onClick={() =>
          onChange({ regionId: 'region-1', districtId: 'district-2' })
        }
      >
        fill-district-2
      </button>
      <button
        type="button"
        data-testid="clear-region"
        onClick={() => onChange({ regionId: undefined, districtId: undefined })}
      >
        clear-region
      </button>
    </div>
  ),
}));
vi.mock('@/components/layout/LoginModal', () => ({ LoginModal: () => null }));
vi.mock('next-intl', () => {
  const resolve = (ns: string) => {
    const lookup = (key: string, params?: Record<string, unknown>): string => {
      const root = (ns ? (ru as any)[ns] : ru) as any;
      const val = key
        .split('.')
        .reduce(
          (o: any, k: string) =>
            o && typeof o === 'object' ? o[k] : undefined,
          root,
        );
      if (typeof val !== 'string') return key;
      // Простая подстановка ICU-параметров {name} — нужна для текста alert'а.
      return params
        ? val.replace(/\{(\w+)\}/g, (m, k) =>
            k in params ? String(params[k]) : m,
          )
        : val;
    };
    // t.rich (напр. contactGate.noPhoneHint): для теста достаточно вернуть
    // разрешённую строку — chunks-функции не вызываем.
    (lookup as any).rich = (key: string) => lookup(key);
    return lookup;
  };
  return { useTranslations: resolve, useLocale: () => 'ru' };
});

import {
  ListingNew,
  buildListingBody,
  describeListingValidationErrors,
  missingStepFields,
} from './ListingNew';
import type { FormState } from './ListingNew';

const emptyProps = { regions: [], districts: [] };

/** Справочник для тестов шага 2 (названия — как в реальном справочнике, ru). */
const geoProps = {
  regions: [
    { id: 'region-1', name: 'город Ташкент', code: 'toshkent-shahri' },
    { id: 'region-2', name: 'Ташкентская область', code: 'toshkent' },
  ],
  districts: [
    { id: 'district-1', name: 'Юнусабад', regionId: 'region-1' },
    { id: 'district-2', name: 'Чиланзар', regionId: 'region-1' },
    { id: 'district-3', name: 'Кибрайский район', regionId: 'region-2' },
  ],
};

/** Рендерит визард и переходит на шаг 2 (шаг 1 валиден по умолчанию). */
function renderAtStep2(props: typeof geoProps | typeof emptyProps = geoProps) {
  render(<ListingNew {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /далее/i }));
  expect(screen.getByText(/Шаг 2 из/)).toBeInTheDocument();
}

const clickNext = () =>
  fireEvent.click(screen.getByRole('button', { name: /далее/i }));

describe('ListingNew wizard (variant B)', () => {
  it('прогресс-бар не содержит шаг «Контакты», но содержит «Описание» и «Превью»', () => {
    render(<ListingNew {...emptyProps} />);
    expect(screen.queryByText('Контакты')).toBeNull();
    expect(screen.getByText('Описание')).toBeInTheDocument();
    expect(screen.getByText('Превью')).toBeInTheDocument();
  });

  it('(а) шаг 2: поля помечены обязательными, до попытки перехода ошибок нет', () => {
    renderAtStep2();

    expect(screen.getByTestId('select-required')).toHaveTextContent('true');
    expect(screen.getByTestId('address-required')).toHaveTextContent('true');
    // Кнопка «Далее» кликабельна (а не немая disabled), ошибок ещё нет.
    expect(screen.getByRole('button', { name: /далее/i })).not.toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('region-error')).toBeNull();
    expect(screen.queryByTestId('district-error')).toBeNull();
    expect(screen.queryByTestId('address-error')).toBeNull();
  });

  it('(а) «Далее» с пустыми полями → alert с названиями полей, шаг не меняется, поля подсвечены', () => {
    renderAtStep2();
    clickNext();

    // Остались на шаге 2.
    expect(screen.getByText(/Шаг 2 из/)).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Регион');
    expect(alert).toHaveTextContent('Район');
    expect(alert).toHaveTextContent('Адрес');
    expect(screen.getByTestId('region-error')).toHaveTextContent('Обязательное поле');
    expect(screen.getByTestId('district-error')).toBeInTheDocument();
    expect(screen.getByTestId('address-error')).toBeInTheDocument();
  });

  it('(а) подсветка конкретного поля снимается, как только его заполнили', () => {
    renderAtStep2(emptyProps); // без справочника — автоадрес пустой
    clickNext();

    fireEvent.click(screen.getByTestId('fill-address'));
    expect(screen.queryByTestId('address-error')).toBeNull();
    expect(screen.getByTestId('region-error')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Регион');
    expect(alert).not.toHaveTextContent('Адрес');

    // Всё ещё не пускает дальше.
    clickNext();
    expect(screen.getByText(/Шаг 2 из/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('fill-region-only'));
    expect(screen.queryByTestId('region-error')).toBeNull();
    expect(screen.getByTestId('district-error')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Район');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Регион');

    fireEvent.click(screen.getByTestId('fill-region'));
    expect(screen.queryByTestId('district-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(а) после заполнения обязательных полей «Далее» переводит на шаг 3', () => {
    renderAtStep2();
    clickNext();
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('fill-region'));
    fireEvent.click(screen.getByTestId('fill-address'));
    clickNext();

    expect(screen.getByText(/Шаг 3 из/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(а) остальные шаги — как раньше: «Далее» disabled, пока шаг не заполнен', () => {
    renderAtStep2();
    fireEvent.click(screen.getByTestId('fill-region'));
    clickNext();
    // Шаг 3: площадь и год не заполнены.
    expect(screen.getByText(/Шаг 3 из/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /далее/i })).toBeDisabled();
  });

  it('missingStepFields: шаг 2 — регион, район, адрес; прочие шаги — пусто', () => {
    const empty = { address: '  ', regionId: '', districtId: '' };
    expect(missingStepFields(2, empty)).toEqual(['region', 'district', 'address']);
    expect(
      missingStepFields(2, { address: 'ул. 1', regionId: 'r', districtId: '' }),
    ).toEqual(['district']);
    expect(
      missingStepFields(2, { address: 'ул. 1', regionId: 'r', districtId: 'd' }),
    ).toEqual([]);
    expect(missingStepFields(3, empty)).toEqual([]);
  });

  it('(д) автоадрес: регион → «{Регион}», регион+район → «{Регион}, {Район}»', () => {
    renderAtStep2();
    const address = screen.getByTestId('address-value');
    expect(address).toHaveTextContent('');

    fireEvent.click(screen.getByTestId('fill-region-only'));
    expect(address).toHaveTextContent('город Ташкент');

    fireEvent.click(screen.getByTestId('fill-region'));
    expect(address).toHaveTextContent('город Ташкент, Юнусабад');

    // Адрес всё ещё автосгенерированный → смена района его обновляет.
    fireEvent.click(screen.getByTestId('fill-district-2'));
    expect(address).toHaveTextContent('город Ташкент, Чиланзар');

    // Сброс региона убирает автоадрес (он не был отредактирован).
    fireEvent.click(screen.getByTestId('clear-region'));
    expect(address).toHaveTextContent('');
  });

  it('(д) автоадрес НЕ затирает текст, введённый пользователем', () => {
    renderAtStep2();
    const address = screen.getByTestId('address-value');

    fireEvent.click(screen.getByTestId('fill-address'));
    fireEvent.click(screen.getByTestId('fill-region'));
    expect(address).toHaveTextContent('ул. Тестовая, 1');

    // Автоадрес → пользователь отредактировал → смена района текст не трогает.
    fireEvent.click(screen.getByTestId('clear-address'));
    fireEvent.click(screen.getByTestId('fill-region'));
    expect(address).toHaveTextContent('город Ташкент, Юнусабад');
    fireEvent.click(screen.getByTestId('fill-address'));
    fireEvent.click(screen.getByTestId('fill-district-2'));
    expect(address).toHaveTextContent('ул. Тестовая, 1');
  });

  it('(д) пустой адрес снова заполняется автоадресом при выборе района', () => {
    renderAtStep2();
    fireEvent.click(screen.getByTestId('fill-address'));
    fireEvent.click(screen.getByTestId('clear-address'));
    fireEvent.click(screen.getByTestId('fill-district-2'));
    expect(screen.getByTestId('address-value')).toHaveTextContent(
      'город Ташкент, Чиланзар',
    );
  });

  it('(е) точка на карте: ставит регион/район, автоадрес НЕ перекрывает адрес с карты', () => {
    renderAtStep2();
    const address = screen.getByTestId('address-value');

    // Сначала автоадрес от селектов, затем клик по карте в другом регионе.
    fireEvent.click(screen.getByTestId('fill-region'));
    expect(address).toHaveTextContent('город Ташкент, Юнусабад');

    fireEvent.click(screen.getByTestId('map-pick'));
    expect(screen.getByTestId('select-value')).toHaveTextContent('region-2|district-3');
    expect(address).toHaveTextContent('Ташкент, улица Амира Темура, 12');

    // Дальнейшая смена района руками адрес с карты тоже не затирает.
    fireEvent.click(screen.getByTestId('fill-district-2'));
    expect(address).toHaveTextContent('Ташкент, улица Амира Темура, 12');
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

  it('проактивный лимит: blocked=true → модалка «Стать агентом» сразу на маунте', () => {
    mockQuota = {
      data: { used: 3, limit: 3, blocked: true },
      isLoading: false,
    };
    render(<ListingNew {...emptyProps} />);
    // Кнопка CTA модалки (ru: listingNew.limitModal.becomeAgent).
    expect(
      screen.getByText((ru as any).listingNew.limitModal.becomeAgent),
    ).toBeInTheDocument();
  });

  it('не на лимите: blocked=false → модалка лимита НЕ показана', () => {
    render(<ListingNew {...emptyProps} />);
    expect(
      screen.queryByText((ru as any).listingNew.limitModal.becomeAgent),
    ).toBeNull();
  });
});

describe('describeListingValidationErrors', () => {
  // Заглушка t: возвращает сам ключ — так проверяем маппинг label/reason.
  const idT = (k: string) => k;

  it('пустой/отсутствующий details → пустой список', () => {
    expect(describeListingValidationErrors(undefined, idT)).toEqual([]);
    expect(describeListingValidationErrors([], idT)).toEqual([]);
  });

  it('дедуплицирует одно поле и сортирует пункты по шагу визарда', () => {
    const items = describeListingValidationErrors(
      [
        { field: 'price', issue: 'a' },
        { field: 'year_built', issue: 'b' },
        { field: 'price', issue: 'dup' },
      ],
      idT,
    );
    expect(items.map((i) => i.key)).toEqual(['year_built', 'price']);
    expect(items[0]).toMatchObject({
      key: 'year_built',
      label: 'fields.yearBuilt',
      reason: 'validation.reasons.yearBuilt',
      step: 3,
    });
    expect(items[1]).toMatchObject({
      key: 'price',
      reason: 'validation.reasons.price',
      step: 4,
    });
  });

  it('нормализует индексы массивов в пути поля (tour_windows.0.start)', () => {
    const [item] = describeListingValidationErrors(
      [{ field: 'tour_windows.0.start', issue: 'HH:MM' }],
      idT,
    );
    expect(item).toMatchObject({
      key: 'tour_windows.start',
      label: 'validation.tourWindow',
      step: 6,
    });
  });

  it('вложенное translation.title → шаг «Описание» (6)', () => {
    const [item] = describeListingValidationErrors(
      [{ field: 'translation.title', issue: 'empty' }],
      idT,
    );
    expect(item).toMatchObject({ label: 'fields.title.label', step: 6 });
  });

  it('неизвестное поле → показываем по имени с дефолтной причиной, последним', () => {
    const items = describeListingValidationErrors(
      [
        { field: 'mystery_field', issue: '?' },
        { field: 'area', issue: 'x' },
      ],
      idT,
    );
    // area (шаг 3) раньше неизвестного (шаг = длина STEPS = 7).
    expect(items.map((i) => i.key)).toEqual(['area', 'mystery_field']);
    expect(items[1]).toMatchObject({
      key: 'mystery_field',
      label: 'mystery_field',
      reason: 'validation.reasons.default',
    });
  });
});
