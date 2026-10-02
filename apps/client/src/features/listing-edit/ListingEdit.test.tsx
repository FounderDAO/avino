/**
 * ListingEdit — юнит-тесты чистых функций (Task C3).
 *
 * Стратегия: тестируем экспортированные чистые функции `detailToForm` и
 * `buildEditPatch` напрямую — без монтирования компонента (по образцу C2,
 * где `buildListingBody` тестируется изолированно). Моки нужны из-за того,
 * что импортирующий модуль ListingEdit.tsx тянет Next.js/RTK зависимости.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Обязательные моки (то же, что в ListingNew.test.tsx) ──────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'ru',
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/amenitiesApi', () => ({
  useListAmenitiesQuery: () => ({ data: [], isLoading: false }),
}));
/** Деталь объявления, отдаваемая мок-запросом (тесты рендера ставят свою). */
let mockDetail: unknown = undefined;
beforeEach(() => {
  mockDetail = undefined;
});
vi.mock('@/store/api/listingEditApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/listingEditApi')>();
  return {
    ...actual,
    useGetListingForEditQuery: () => ({ data: mockDetail, isLoading: false, isError: false }),
    useUpdateListingMutation: () => [vi.fn(), {}],
    useAddListingMediaMutation: () => [vi.fn(), {}],
    useDeleteListingMediaMutation: () => [vi.fn(), {}],
    useReorderListingMediaMutation: () => [vi.fn(), {}],
  };
});
/**
 * AddressStep — мок: рендерит полученные пропсы (адрес, обязательность, наличие
 * проводки «карта → регион/район»), чтобы проверить, что редактирование ничего
 * не перезаписывает автоматически.
 */
vi.mock('@/features/listing-new/AddressStep', () => ({
  AddressStep: (props: {
    address: string;
    required?: boolean;
    onLocationFromMap?: unknown;
    onAddressChange: (v: string) => void;
  }) => {
    addressChangeSpy = props.onAddressChange;
    return (
      <div>
        <span data-testid="address-value">{props.address}</span>
        <span data-testid="address-required">{String(Boolean(props.required))}</span>
        <span data-testid="address-map-wired">{String(Boolean(props.onLocationFromMap))}</span>
      </div>
    );
  },
}));
/** Последний onAddressChange, переданный в AddressStep. */
let addressChangeSpy: ((v: string) => void) | null = null;
vi.mock('@/features/listing-new/PhotoUploader', () => ({
  PhotoUploader: () => null,
}));
vi.mock('@/features/listing-new/PickMap', () => ({}));
vi.mock('@/features/listing-shared/ToursSection', () => ({
  ToursSection: () => null,
}));
vi.mock('@/features/listing-new/RegionDistrictSelect', () => ({
  RegionDistrictSelect: ({
    onChange,
    regionId,
    districtId,
    required,
  }: {
    onChange: (v: { regionId?: string; districtId?: string }) => void;
    regionId?: string;
    districtId?: string;
    required?: boolean;
  }) => (
    <div>
      <span data-testid="select-value">{`${regionId ?? ''}|${districtId ?? ''}`}</span>
      <span data-testid="select-required">{String(Boolean(required))}</span>
      <button
        type="button"
        data-testid="pick-district-2"
        onClick={() => onChange({ regionId: 'region-1', districtId: 'district-2' })}
      >
        pick
      </button>
      <button
        type="button"
        data-testid="clear-region"
        onClick={() => onChange({ regionId: undefined, districtId: undefined })}
      >
        clear
      </button>
    </div>
  ),
}));

// Импорт ПОСЛЕ моков
import {
  ListingEdit,
  detailToForm,
  buildEditPatch,
  missingRequiredFields,
} from './ListingEdit';
import type { EditListingDetail } from '@/store/api/listingEditApi';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Минимальный объект EditListingDetail для тестов. */
function makeDetail(overrides: Partial<EditListingDetail> = {}): EditListingDetail {
  return {
    id: 'listing-1',
    status: 'ACTIVE',
    transaction_type: 'SALE',
    property_type: 'APARTMENT',
    price: '100000.00',
    currency: 'USD',
    area: '60',
    lot_area: null,
    rooms: 2,
    bathrooms: null,
    parking_type: null,
    amenities: [],
    floor: null,
    total_floors: null,
    year_built: null,
    city_id: null,
    district_id: null,
    address: 'ул. Тестовая, 1',
    latitude: null,
    longitude: null,
    owner_id: 'user-1',
    language: 'RU',
    title: 'Тест',
    description: null,
    address_note: null,
    media: [],
    tours_enabled: false,
    tour_windows: [],
    ...overrides,
  };
}

// ── Тесты detailToForm ─────────────────────────────────────────────────────────

describe('detailToForm', () => {
  it('префиллит regionId из city_id объявления', () => {
    const f = detailToForm(makeDetail({ city_id: 'region-uuid' }));
    expect(f.regionId).toBe('region-uuid');
  });

  it('префиллит districtId из district_id объявления', () => {
    const f = detailToForm(makeDetail({ district_id: 'district-uuid' }));
    expect(f.districtId).toBe('district-uuid');
  });

  it('устанавливает пустую строку если city_id/district_id = null', () => {
    const f = detailToForm(makeDetail({ city_id: null, district_id: null }));
    expect(f.regionId).toBe('');
    expect(f.districtId).toBe('');
  });
});

// ── Тесты buildEditPatch ───────────────────────────────────────────────────────

describe('buildEditPatch', () => {
  /** Минимальный EditForm для тестов. */
  const BASE_FORM = {
    tx: 'SALE' as const,
    type: 'APARTMENT' as const,
    address: 'ул. Тестовая, 1',
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
    currency: 'USD' as const,
    lang: 'RU' as const,
    title: 'Тест',
    desc: '',
    toursEnabled: false,
    tourWindows: [],
    amenities: [],
  };

  it('включает city_id и district_id в патч когда они заданы', () => {
    const patch = buildEditPatch({
      ...BASE_FORM,
      regionId: 'region-uuid',
      districtId: 'district-uuid',
    });
    expect(patch.city_id).toBe('region-uuid');
    expect(patch.district_id).toBe('district-uuid');
  });

  it('не включает city_id/district_id в патч когда они пустые', () => {
    const patch = buildEditPatch({ ...BASE_FORM, regionId: '', districtId: '' });
    expect(patch.city_id).toBeUndefined();
    expect(patch.district_id).toBeUndefined();
  });

  it('шлёт null для очищенных необязательных полей (их можно стереть)', () => {
    const patch = buildEditPatch({
      ...BASE_FORM,
      floor: '',
      totalFloors: '',
      year: '',
      bathrooms: '',
      lotArea: '',
      parking: '',
      desc: '',
    });
    expect(patch.floor).toBeNull();
    expect(patch.total_floors).toBeNull();
    expect(patch.year_built).toBeNull();
    expect(patch.bathrooms).toBeNull();
    expect(patch.lot_area).toBeNull();
    expect(patch.parking_type).toBeNull();
    expect(patch.translation?.description).toBeNull();
  });

  it('шлёт значения когда необязательные поля заполнены', () => {
    const patch = buildEditPatch({
      ...BASE_FORM,
      floor: '5',
      totalFloors: '9',
      year: '2020',
      bathrooms: '2',
      parking: 'YARD',
    });
    expect(patch.floor).toBe(5);
    expect(patch.total_floors).toBe(9);
    expect(patch.year_built).toBe(2020);
    expect(patch.bathrooms).toBe(2);
    expect(patch.parking_type).toBe('YARD');
  });

  it('цоколь: floor = null даже если этаж введён', () => {
    const patch = buildEditPatch({ ...BASE_FORM, isBasement: true, floor: '3' });
    expect(patch.floor).toBeNull();
    expect(patch.is_basement).toBe(true);
  });
});

// ── Тесты missingRequiredFields ──────────────────────────────────────────────
describe('missingRequiredFields', () => {
  const FULL_FORM = {
    tx: 'SALE' as const,
    type: 'APARTMENT' as const,
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
    // Год постройки обязателен для квартир/домов (категория «новостройка»).
    year: '2020',
    price: '100000',
    currency: 'USD' as const,
    lang: 'RU' as const,
    title: 'Нормальный заголовок',
    desc: '',
    toursEnabled: false,
    tourWindows: [],
    amenities: [],
  };

  it('пусто, когда все обязательные поля заполнены и есть фото', () => {
    expect(missingRequiredFields(FULL_FORM, 1)).toEqual([]);
  });

  it('сообщает про район, когда district пуст (правку этажа сохранить нельзя)', () => {
    const missing = missingRequiredFields({ ...FULL_FORM, districtId: '' }, 1);
    expect(missing).toContain('location');
  });

  it('сообщает про площадь и фото, когда их нет', () => {
    const missing = missingRequiredFields({ ...FULL_FORM, area: '' }, 0);
    expect(missing).toContain('area');
    expect(missing).toContain('photos');
  });

  it('не требует комнаты для участка (LAND)', () => {
    const missing = missingRequiredFields({ ...FULL_FORM, type: 'LAND', rooms: '' }, 1);
    expect(missing).not.toContain('rooms');
  });

  it('требует год постройки для квартиры', () => {
    const missing = missingRequiredFields({ ...FULL_FORM, year: '' }, 1);
    expect(missing).toContain('year');
  });

  it('не требует год постройки для участка (LAND)', () => {
    const missing = missingRequiredFields({ ...FULL_FORM, type: 'LAND', rooms: '', year: '' }, 1);
    expect(missing).not.toContain('year');
  });
});

// ── Рендер: блок «Адрес» на странице редактирования ──────────────────────────
describe('ListingEdit — регион/район/адрес', () => {
  const GEO = {
    regions: [{ id: 'region-1', name: 'город Ташкент', code: 'toshkent-shahri' }],
    districts: [
      { id: 'district-1', name: 'Юнусабад', regionId: 'region-1' },
      { id: 'district-2', name: 'Чиланзар', regionId: 'region-1' },
    ],
  };

  const renderEdit = (overrides: Partial<EditListingDetail> = {}) => {
    mockDetail = makeDetail({
      city_id: 'region-1',
      district_id: 'district-1',
      address: 'ул. Сохранённая, 5',
      ...overrides,
    });
    render(<ListingEdit id="listing-1" {...GEO} />);
  };

  it('открытие с сохранённым адресом ничего не перезаписывает', () => {
    renderEdit();
    expect(screen.getByTestId('address-value')).toHaveTextContent('ул. Сохранённая, 5');
    expect(screen.getByTestId('select-value')).toHaveTextContent('region-1|district-1');
  });

  it('поля помечены обязательными; автоподстановки от карты на edit нет', () => {
    renderEdit();
    expect(screen.getByTestId('select-required')).toHaveTextContent('true');
    expect(screen.getByTestId('address-required')).toHaveTextContent('true');
    expect(screen.getByTestId('address-map-wired')).toHaveTextContent('false');
  });

  it('смена района и сброс региона не трогают сохранённый адрес', () => {
    renderEdit();

    fireEvent.click(screen.getByTestId('pick-district-2'));
    expect(screen.getByTestId('select-value')).toHaveTextContent('region-1|district-2');
    expect(screen.getByTestId('address-value')).toHaveTextContent('ул. Сохранённая, 5');

    fireEvent.click(screen.getByTestId('clear-region'));
    expect(screen.getByTestId('select-value')).toHaveTextContent('|');
    expect(screen.getByTestId('address-value')).toHaveTextContent('ул. Сохранённая, 5');
  });

  it('адрес по-прежнему редактируется вручную', () => {
    renderEdit();
    expect(addressChangeSpy).not.toBeNull();
    React.act(() => addressChangeSpy!('ул. Новая, 7'));
    expect(screen.getByTestId('address-value')).toHaveTextContent('ул. Новая, 7');
  });
});
