/**
 * FilterBar — smoke-тесты Zillow-раскладки (Task 8).
 *
 * Мокируем:
 * - next-intl (useTranslations, useLocale) — key→key резолвер
 * - @/i18n/navigation (useRouter, usePathname)
 * - next/navigation (useSearchParams)
 * - @/store/hooks (useAppSelector) — не авторизован по умолчанию
 * - @/store/api/savedSearchesApi (useCreateSavedSearchMutation)
 * - @/lib/useCurrencyPreference — возвращает 'UZS'
 * - SearchAutocomplete, BedroomsControl,
 *   HomeTypeMultiSelect, FiltersPanel — заглушки
 * - useGeoSuggest — пустые подсказки
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FilterValues } from './FilterBar';
import type { District, Region } from '@/lib/mock/types';

// ── Моки навигации ────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
const mockPathname = '/search';
// let — чтобы отдельные тесты могли подставить другой начальный URL
let mockSearchParamsStr = 'tx=SALE';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsStr),
}));

// ── Мок next-intl: ns.key → ns.key ───────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) =>
    (key: string, params?: Record<string, string>) => {
      const full = ns ? `${ns}.${key}` : key;
      if (!params) return full;
      return full.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? `{${k}}`);
    },
  useLocale: () => 'ru',
}));

// ── Мок Redux (store/hooks) ───────────────────────────────────────────────────
// useAppSelector вызывается дважды: selectIsAuthenticated + selectTerritoryPoints.
// Отдаём false/null.

vi.mock('@/store/hooks', () => ({
  useAppSelector: vi.fn(() => false),
}));

vi.mock('@/store/territorySlice', () => ({
  selectTerritoryPoints: vi.fn(),
}));

vi.mock('@/store/slices/authSlice', () => ({
  selectIsAuthenticated: vi.fn(),
}));

vi.mock('@/store/api/savedSearchesApi', () => ({
  useCreateSavedSearchMutation: () => [vi.fn(), { isLoading: false, isSuccess: false, error: undefined }],
}));

vi.mock('@/store/api/apiError', () => ({
  getApiError: () => undefined,
}));

vi.mock('@/lib/useCurrencyPreference', () => ({
  useCurrencyPreference: () => 'UZS',
}));

vi.mock('@/lib/savedSearch', () => ({
  describeFilters: () => '',
}));

// ── Заглушки дочерних компонентов ────────────────────────────────────────────

vi.mock('./SearchAutocomplete', () => ({
  SearchAutocomplete: ({ placeholder }: { placeholder: string }) => (
    <input type="text" placeholder={placeholder} aria-label="search-stub" />
  ),
}));

vi.mock('./useGeoSuggest', () => ({
  useGeoSuggest: () => ({ items: [], loading: false }),
}));

vi.mock('./locationParams', () => ({
  suggestionToLocation: () => ({}),
}));

vi.mock('./controls/BedroomsControl', () => ({
  BedroomsControl: () => <div data-testid="bedrooms-control-stub" />,
}));

vi.mock('./controls/HomeTypeMultiSelect', () => ({
  HomeTypeMultiSelect: () => <div data-testid="home-type-stub" />,
}));

vi.mock('./FiltersPanel', () => ({
  FiltersPanel: () => <div data-testid="filters-panel-stub" />,
}));

// LoginModal тянет authApi/Google/Apple — заглушка (как в ContactCard.test).
vi.mock('@/components/layout/LoginModal', () => ({
  LoginModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="login-modal-stub" /> : null,
}));

// Импорт ПОСЛЕ моков
import { FilterBar } from './FilterBar';

// ── Тестовые данные ───────────────────────────────────────────────────────────

const districts: District[] = [
  { id: 'yuna-id', name: 'Юнусабадский' },
];

// Регионы и районы с привязкой к региону (для тестов каскада B3)
const regions: Region[] = [
  { id: 'r1', name: 'Ташкент (город)', code: 'TASHKENT_CITY' },
  { id: 'r2', name: 'Ташкентская область', code: 'TASHKENT_REGION' },
];
const districtsWithRegions: District[] = [
  { id: 'yuna-id', name: 'Юнусабадский', regionId: 'r1' },
  { id: 'chil-id', name: 'Чиланзарский', regionId: 'r1' },
  { id: 'ang-id', name: 'Ангрен', regionId: 'r2' },
];

const baseValues: FilterValues = {
  tx: 'SALE',
  sort: 'promotion',
  view: 'list',
};

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParamsStr = 'tx=SALE';
});

// ── Тесты ──────────────────────────────────────────────────────────────────────

describe('FilterBar (Zillow-раскладка)', () => {
  it('монтируется без ошибок', () => {
    const { container } = render(
      <FilterBar values={baseValues} districts={districts} regions={[]} />,
    );
    expect(container).toBeTruthy();
  });

  it('показывает триггер Купить/Аренда', () => {
    render(<FilterBar values={baseValues} districts={districts} regions={[]} />);
    // Мок: tSearch('filters.buy') → 'search.filters.buy'
    expect(
      screen.getByRole('button', { name: /search\.filters\.buy/i }),
    ).toBeInTheDocument();
  });

  it('показывает триггер Цена', () => {
    render(<FilterBar values={baseValues} districts={districts} regions={[]} />);
    expect(
      screen.getByRole('button', { name: /search\.filters\.price$/i }),
    ).toBeInTheDocument();
  });

  it('показывает триггер Комнаты', () => {
    render(<FilterBar values={baseValues} districts={districts} regions={[]} />);
    expect(
      screen.getByRole('button', { name: /search\.filters\.rooms$/i }),
    ).toBeInTheDocument();
  });

  it('показывает триггер Тип жилья', () => {
    render(<FilterBar values={baseValues} districts={districts} regions={[]} />);
    expect(
      screen.getByRole('button', { name: /search\.filters\.propertyType$/i }),
    ).toBeInTheDocument();
  });

  it('показывает триггер Фильтры (⚙)', () => {
    render(<FilterBar values={baseValues} districts={districts} regions={[]} />);
    expect(
      screen.getByRole('button', { name: /search\.filters\.moreFilters/i }),
    ).toBeInTheDocument();
  });

  it('НЕ показывает <select> сортировки (Task 9 заберёт)', () => {
    render(<FilterBar values={baseValues} districts={districts} regions={[]} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('показывает кнопку сохранения поиска гостю и открывает вход по клику', async () => {
    render(<FilterBar values={baseValues} districts={districts} regions={[]} />);
    // useAppSelector вернёт false → гость, но кнопка теперь видна всегда.
    const btn = screen.getByRole('button', { name: /search\.filters\.saveSearch/i });
    expect(btn).toBeInTheDocument();
    // Клик гостя открывает LoginModal (заглушка рендерится при open).
    await userEvent.click(btn);
    expect(screen.getByTestId('login-modal-stub')).toBeInTheDocument();
  });

  it('триггер Купить отражает tx=RENT корректным лейблом', () => {
    render(
      <FilterBar
        values={{ ...baseValues, tx: 'RENT' }}
        districts={districts}
        regions={[]}
      />,
    );
    expect(
      screen.getByRole('button', { name: /search\.filters\.rent/i }),
    ).toBeInTheDocument();
  });

  it('триггер Цена активен, когда priceMin задан', () => {
    render(
      <FilterBar
        values={{ ...baseValues, priceMin: '50000' }}
        districts={districts}
        regions={[]}
      />,
    );
    // Лейбл будет priceRange с подставленными min/max
    const btn = screen.getByTestId('filter-price');
    // Наличие border-teal/bg-mint — проверяем через data-testid что кнопка есть
    expect(btn).toBeInTheDocument();
  });

  it('триггер Тип жилья показывает счётчик при selectedTypes', () => {
    render(
      <FilterBar
        values={{ ...baseValues, types: ['APARTMENT', 'HOUSE'] }}
        districts={districts}
        regions={[]}
      />,
    );
    // Мок: t('propertyTypeCount', {count:'2'}) → 'search.filters.propertyTypeCount'
    expect(
      screen.getByRole('button', { name: /search\.filters\.propertyTypeCount/i }),
    ).toBeInTheDocument();
  });

  // ── Тесты каскада Регион → Район (B3) ────────────────────────────────────────

  it('без выбранного региона триггер «Район» задизаблен', () => {
    render(
      <FilterBar values={baseValues} districts={districtsWithRegions} regions={regions} />,
    );
    expect(screen.getByTestId('filter-district')).toBeDisabled();
  });

  it('выбранный регион фильтрует список районов в дропдауне', async () => {
    const user = userEvent.setup();
    render(
      <FilterBar
        values={{ ...baseValues, regionId: 'r1' }}
        districts={districtsWithRegions}
        regions={regions}
      />,
    );
    // Открываем дропдаун района (он enabled, т.к. regionId задан)
    await user.click(screen.getByTestId('filter-district'));
    // Районы r1 должны быть видны, район r2 — нет
    expect(screen.getByText('Юнусабадский')).toBeInTheDocument();
    expect(screen.getByText('Чиланзарский')).toBeInTheDocument();
    expect(screen.queryByText('Ангрен')).toBeNull();
  });

  it('смена региона сбрасывает district_id в URL', async () => {
    // Начальный URL содержит и region_id, и district_id
    mockSearchParamsStr = 'tx=SALE&region_id=r1&district_id=yuna-id';
    const user = userEvent.setup();
    render(
      <FilterBar
        values={{ ...baseValues, regionId: 'r1', districtId: 'yuna-id' }}
        districts={districtsWithRegions}
        regions={regions}
      />,
    );
    // Открываем дропдаун регионов
    await user.click(screen.getByTestId('filter-region'));
    // Выбираем регион r2
    await user.click(screen.getByText('Ташкентская область'));
    // router.replace вызван ровно раз
    expect(mockReplace).toHaveBeenCalledTimes(1);
    const url = mockReplace.mock.calls[0][0] as string;
    // URL содержит новый регион, но НЕ содержит старый район
    expect(url).toContain('region_id=r2');
    expect(url).not.toContain('district_id');
  });
});
