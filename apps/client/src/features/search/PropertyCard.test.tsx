/**
 * Тесты PropertyCard (компактный Zillow-минимализм).
 * Мокируем зависимости с провайдерами/стором, чтобы рендерить изолированно.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PropertyCard } from './PropertyCard';
import type { Listing } from '@/lib/mock/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/usePriceFormatter', () => ({
  usePriceFormatter: () => ({ price: () => '$108 223' }),
}));
vi.mock('@/components/ui/photo-img', () => ({
  PhotoImg: () => <div data-testid="photo" />,
}));
vi.mock('@/components/ui/promo-badge', () => ({
  PromoBadge: () => null,
  NewBadge: () => null,
}));
vi.mock('@/components/ui/fav-button', () => ({
  FavButton: () => <button aria-label="fav" />,
}));

const listing = {
  id: 'l1',
  title: 'Тестовый заголовок объявления',
  tx: 'SALE',
  type: 'APARTMENT',
  rooms: 4,
  area: 120,
  floor: 3,
  totalFloors: 9,
  district: 'Яшнабад',
  address: 'ул. Тестовая 1',
  createdAt: '2000-01-01T00:00:00.000Z',
  promo: 'NORMAL',
  photos: [{ thumb: '' }],
  agent: { agency: 'Тест-Агентство', pro: false },
} as unknown as Listing;

describe('PropertyCard (compact)', () => {
  it('renders price, specs row and location', () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.getByText('$108 223')).toBeInTheDocument();
    // тип жилья присутствует в строке спеков
    expect(screen.getByText(/propertyType\.APARTMENT/)).toBeInTheDocument();
    // локация
    expect(screen.getByText(/Яшнабад/)).toBeInTheDocument();
  });

  it('omits the transaction label, marketing title and agency line', () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.queryByText(/^tx\.SALE/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Тестовый заголовок объявления'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Тест-Агентство')).not.toBeInTheDocument();
  });
});
