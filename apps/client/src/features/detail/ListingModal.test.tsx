/**
 * Тесты ListingModal — оболочка модалки деталки.
 * Мокаем @/i18n/navigation (useRouter.back, Link→<a>), next-intl (ключи из
 * ru.json) и FavButton/ShareButton/ReportButton (redux/стор в тест не тащим).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Listing } from '@/lib/mock/types';
import ru from '../../../messages/ru.json';

const mockBack = vi.fn();
let mockPathname = '/listing/L1';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back: mockBack }),
  usePathname: () => mockPathname,
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    (ru as unknown as Record<string, Record<string, string>>)[ns]?.[k] ?? `${ns}.${k}`,
}));

vi.mock('@/components/ui/fav-button', () => ({
  FavButton: ({ listingId }: { listingId: string }) => (
    <button type="button" data-testid="fav">
      {listingId}
    </button>
  ),
}));

vi.mock('./ShareButton', () => ({
  ShareButton: () => (
    <button type="button" data-testid="share">
      share
    </button>
  ),
}));

vi.mock('./ReportButton', () => ({
  ReportButton: () => (
    <button type="button" data-testid="report">
      report
    </button>
  ),
}));

import { ListingModal } from './ListingModal';

const listing = { id: 'L1' } as unknown as Listing;

describe('ListingModal', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPathname = '/listing/L1';
  });

  it('рендерит переданный контент', () => {
    render(
      <ListingModal listingId="L1">
        <p>Деталка</p>
      </ListingModal>,
    );
    expect(screen.getByText('Деталка')).toBeInTheDocument();
  });

  it('ссылка «Открыть страницу» ведёт на /listing/[id] в новой вкладке', () => {
    render(
      <ListingModal listingId="L1">
        <p>x</p>
      </ListingModal>,
    );
    const link = screen.getByRole('link', {
      name: new RegExp(ru.listing.openFullPage),
    });
    expect(link).toHaveAttribute('href', '/listing/L1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('клик по «Назад к поиску» (слева в тулбаре) вызывает router.back', () => {
    render(
      <ListingModal listingId="L1">
        <p>x</p>
      </ListingModal>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(ru.listing.backToSearch) }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('с listing рендерит избранное, шеринг и «Пожаловаться» в тулбаре; без listing — нет', () => {
    const { rerender } = render(
      <ListingModal listingId="L1">
        <p>x</p>
      </ListingModal>,
    );
    expect(screen.queryByTestId('fav')).toBeNull();
    expect(screen.queryByTestId('share')).toBeNull();
    expect(screen.queryByTestId('report')).toBeNull();

    rerender(
      <ListingModal listingId="L1" listing={listing}>
        <p>x</p>
      </ListingModal>,
    );
    expect(screen.getByTestId('fav')).toBeInTheDocument();
    expect(screen.getByTestId('share')).toBeInTheDocument();
    expect(screen.getByTestId('report')).toBeInTheDocument();
  });

  it('клик по «Закрыть» вызывает router.back', () => {
    render(
      <ListingModal listingId="L1">
        <p>x</p>
      </ListingModal>,
    );
    fireEvent.click(screen.getByRole('button', { name: ru.common.close }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // Уход с роута объявления (напр. «Написать» → /account/inbox): параллельный
  // слот @modal не сбрасывается, поэтому модалка должна закрыться сама — но БЕЗ
  // router.back (навигация уже ушла вперёд).
  it('закрывается при навигации с /listing/[id] на другой роут без router.back', () => {
    const { rerender } = render(
      <ListingModal listingId="L1">
        <p>Деталка</p>
      </ListingModal>,
    );
    expect(screen.getByText('Деталка')).toBeInTheDocument();

    mockPathname = '/account/inbox';
    rerender(
      <ListingModal listingId="L1">
        <p>Деталка</p>
      </ListingModal>,
    );

    expect(screen.queryByText('Деталка')).not.toBeInTheDocument();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
