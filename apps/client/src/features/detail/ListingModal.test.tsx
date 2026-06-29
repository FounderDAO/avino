/**
 * Тесты ListingModal — оболочка модалки деталки.
 * Мокаем @/i18n/navigation (useRouter.back, Link→<a>) и next-intl (ключи из ru.json).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

const mockBack = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back: mockBack }),
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

import { ListingModal } from './ListingModal';

describe('ListingModal', () => {
  beforeEach(() => mockBack.mockClear());

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

  it('клик по «Закрыть» вызывает router.back', () => {
    render(
      <ListingModal listingId="L1">
        <p>x</p>
      </ListingModal>,
    );
    fireEvent.click(screen.getByRole('button', { name: ru.common.close }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
