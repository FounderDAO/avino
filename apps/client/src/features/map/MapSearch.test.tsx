/**
 * Тесты MapSearch — сплит /map: компактный футер внутри скроллящейся колонки
 * списка (Zillow, спека 2026-07-17). Карта (next/dynamic), RTK Query и
 * тяжёлые зависимости мокируются — проверяем только разметку списка.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapSearch } from './MapSearch';
import type { Listing } from '@/lib/mock/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/dynamic', () => ({
  default: () => {
    const MapStub = () => <div data-testid="map-view" />;
    return MapStub;
  },
}));
vi.mock('@/features/map/useViewportSearch', () => ({
  useViewportSearch: () => ({
    active: true,
    listings: null,
    isFetching: false,
    handleBoundsChange: vi.fn(),
    refetchLastBounds: vi.fn(),
    previewId: null,
    openPreview: vi.fn(),
    closePreview: vi.fn(),
  }),
}));
vi.mock('@/store/api/searchApi', () => ({
  useLazySearchByPolygonQuery: () => [vi.fn(), { isFetching: false }],
}));
vi.mock('@/features/search/PropertyCard', () => ({
  PropertyCard: ({ listing }: { listing: Listing }) => (
    <div data-testid="property-card">{listing.id}</div>
  ),
}));
vi.mock('@/features/map/MapPreviewCard', () => ({
  MapPreviewCard: () => <div data-testid="map-preview" />,
}));
vi.mock('@/components/layout/Footer', () => ({
  Footer: ({ variant }: { variant?: string }) => (
    <footer data-testid="panel-footer" data-variant={variant} />
  ),
}));

const listings = [{ id: 'l1' }, { id: 'l2' }] as unknown as Listing[];

describe('MapSearch', () => {
  it('рендерит карточки стартовой выдачи', () => {
    render(<MapSearch initialListings={listings} locale="ru" />);
    expect(screen.getAllByTestId('property-card')).toHaveLength(2);
  });

  it('компактный футер (variant="panel") внутри колонки списка', () => {
    render(<MapSearch initialListings={listings} locale="ru" />);
    expect(screen.getByTestId('panel-footer')).toHaveAttribute('data-variant', 'panel');
  });

  it('футер на месте и при пустой выдаче', () => {
    render(<MapSearch initialListings={[]} locale="ru" />);
    expect(screen.getByTestId('panel-footer')).toBeInTheDocument();
  });
});
