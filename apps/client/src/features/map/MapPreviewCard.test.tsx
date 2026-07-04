/**
 * Тесты MapPreviewCard — превью объявления поверх карты (клик по пину).
 * PropertyCard мокируется: здесь проверяем только оболочку (рендер + закрытие).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapPreviewCard } from './MapPreviewCard';
import type { Listing } from '@/lib/mock/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/features/search/PropertyCard', () => ({
  PropertyCard: ({ listing }: { listing: Listing }) => (
    <div data-testid="property-card">{listing.id}</div>
  ),
}));

const listing = { id: 'l1' } as unknown as Listing;

describe('MapPreviewCard', () => {
  it('рендерит PropertyCard выбранного листинга', () => {
    render(<MapPreviewCard listing={listing} onClose={() => {}} />);
    expect(screen.getByTestId('property-card')).toHaveTextContent('l1');
  });

  it('кнопка ✕ вызывает onClose', () => {
    const onClose = vi.fn();
    render(<MapPreviewCard listing={listing} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('map.preview.close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
