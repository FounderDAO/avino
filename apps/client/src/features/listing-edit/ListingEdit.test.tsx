/**
 * ListingEdit — юнит-тесты чистых функций (Task C3).
 *
 * Стратегия: тестируем экспортированные чистые функции `detailToForm` и
 * `buildEditPatch` напрямую — без монтирования компонента (по образцу C2,
 * где `buildListingBody` тестируется изолированно). Моки нужны из-за того,
 * что импортирующий модуль ListingEdit.tsx тянет Next.js/RTK зависимости.
 */
import { describe, it, expect, vi } from 'vitest';

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
vi.mock('@/store/api/listingEditApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/listingEditApi')>();
  return {
    ...actual,
    useGetListingForEditQuery: () => ({ data: undefined, isLoading: false, isError: false }),
    useUpdateListingMutation: () => [vi.fn(), {}],
    useAddListingMediaMutation: () => [vi.fn(), {}],
    useDeleteListingMediaMutation: () => [vi.fn(), {}],
    useReorderListingMediaMutation: () => [vi.fn(), {}],
  };
});
vi.mock('@/features/listing-new/AddressStep', () => ({
  AddressStep: () => null,
}));
vi.mock('@/features/listing-new/PhotoUploader', () => ({
  PhotoUploader: () => null,
}));
vi.mock('@/features/listing-new/PickMap', () => ({}));
vi.mock('@/features/listing-shared/ToursSection', () => ({
  ToursSection: () => null,
}));
vi.mock('@/features/listing-new/RegionDistrictSelect', () => ({
  RegionDistrictSelect: () => null,
}));

// Импорт ПОСЛЕ моков
import { detailToForm, buildEditPatch, missingRequiredFields } from './ListingEdit';
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
    year: '',
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
});
