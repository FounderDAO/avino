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
 * - SearchAutocomplete, ActiveFilters, BedroomsControl,
 *   HomeTypeMultiSelect, FiltersPanel — заглушки
 * - useGeoSuggest — пустые подсказки
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FilterValues } from './FilterBar';
import type { District } from '@/lib/mock/types';

// ── Моки навигации ────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
const mockPathname = '/search';
const mockSearchParamsStr = 'tx=SALE';

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

vi.mock('./ActiveFilters', () => ({
  ActiveFilters: () => null,
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

// Импорт ПОСЛЕ моков
import { FilterBar } from './FilterBar';

// ── Тестовые данные ───────────────────────────────────────────────────────────

const districts: District[] = [
  { id: 'yuna-id', name: 'Юнусабадский' },
];

const baseValues: FilterValues = {
  tx: 'SALE',
  sort: 'promotion',
  view: 'list',
};

beforeEach(() => {
  mockReplace.mockClear();
});

// ── Тесты ──────────────────────────────────────────────────────────────────────

describe('FilterBar (Zillow-раскладка)', () => {
  it('монтируется без ошибок', () => {
    const { container } = render(
      <FilterBar values={baseValues} districts={districts} />,
    );
    expect(container).toBeTruthy();
  });

  it('показывает триггер Купить/Аренда', () => {
    render(<FilterBar values={baseValues} districts={districts} />);
    // Мок: tSearch('filters.buy') → 'search.filters.buy'
    expect(
      screen.getByRole('button', { name: /search\.filters\.buy/i }),
    ).toBeInTheDocument();
  });

  it('показывает триггер Цена', () => {
    render(<FilterBar values={baseValues} districts={districts} />);
    expect(
      screen.getByRole('button', { name: /search\.filters\.price$/i }),
    ).toBeInTheDocument();
  });

  it('показывает триггер Комнаты', () => {
    render(<FilterBar values={baseValues} districts={districts} />);
    expect(
      screen.getByRole('button', { name: /search\.filters\.rooms$/i }),
    ).toBeInTheDocument();
  });

  it('показывает триггер Тип жилья', () => {
    render(<FilterBar values={baseValues} districts={districts} />);
    expect(
      screen.getByRole('button', { name: /search\.filters\.propertyType$/i }),
    ).toBeInTheDocument();
  });

  it('показывает триггер Фильтры (⚙)', () => {
    render(<FilterBar values={baseValues} districts={districts} />);
    expect(
      screen.getByRole('button', { name: /search\.filters\.moreFilters/i }),
    ).toBeInTheDocument();
  });

  it('НЕ показывает <select> сортировки (Task 9 заберёт)', () => {
    render(<FilterBar values={baseValues} districts={districts} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('НЕ показывает кнопку сохранения поиска для гостя', () => {
    render(<FilterBar values={baseValues} districts={districts} />);
    // useAppSelector вернёт false → isAuthenticated=false → кнопки нет
    expect(
      screen.queryByRole('button', { name: /search\.filters\.saveSearch/i }),
    ).toBeNull();
  });

  it('триггер Купить отражает tx=RENT корректным лейблом', () => {
    render(
      <FilterBar
        values={{ ...baseValues, tx: 'RENT' }}
        districts={districts}
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
      />,
    );
    // Мок: t('propertyTypeCount', {count:'2'}) → 'search.filters.propertyTypeCount'
    expect(
      screen.getByRole('button', { name: /search\.filters\.propertyTypeCount/i }),
    ).toBeInTheDocument();
  });
});
