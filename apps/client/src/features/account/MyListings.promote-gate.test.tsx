/**
 * MyListings — тест гейтирования кнопки «Продвинуть» флагом promotionsEnabled.
 *
 * Кнопка «Продвинуть» показывается ТОЛЬКО если:
 *   1. promotionsEnabled=true (usePromotionsEnabled вернул true)
 *   2. l.promo === 'NORMAL' (объявление не продвинуто)
 *
 * Эти два кейса покрывают fail-safe: по умолчанию (флаг выкл.) кнопки нет.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Listing } from '@/lib/mock/types';

// --- Мок флага промо (управляем значением в каждом тесте) ---
const mockUsePromotionsEnabled = vi.fn<() => boolean>(() => false);

vi.mock('@/lib/usePromotionsEnabled', () => ({
  usePromotionsEnabled: () => mockUsePromotionsEnabled(),
}));

// --- Мок авторизации (всегда залогинен) ---
vi.mock('@/store/hooks', () => ({
  useAppSelector: () => true,
}));

// --- Мок API листингов (данные задаём через mockGetMyListings) ---
type MyListingsResult = {
  data: { items: Listing[]; total: number } | undefined;
  isLoading: boolean;
};
const mockGetMyListings = vi.fn<() => MyListingsResult>(() => ({
  data: undefined,
  isLoading: false,
}));

vi.mock('@/store/api/myListingsApi', () => ({
  useGetMyListingsQuery: () => mockGetMyListings(),
  useSetMyListingStatusMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock('@/lib/usePriceFormatter', () => ({
  usePriceFormatter: () => ({
    price: () => '100 000 $',
    display: 'USD',
    pin: () => '100K',
  }),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/ui/photo-img', () => ({
  PhotoImg: ({ alt }: { alt?: string }) => <img alt={alt ?? ''} />,
}));

vi.mock('@/components/ui/promo-badge', () => ({
  PromoBadge: () => null,
}));

vi.mock('./ownerListingActions', () => ({
  ownerActionsFor: () => [],
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
}));

// Импорт ПОСЛЕ моков
import { MyListings } from './MyListings';

/** Минимальный листинг с promo=NORMAL для тестирования гейта. */
function makeListingNormal(): Listing {
  return {
    id: 'lst-1',
    tx: 'SALE',
    type: 'APARTMENT',
    promo: 'NORMAL',
    price: 100_000,
    currency: 'USD',
    title: 'Тест квартира',
    desc: '',
    address: '',
    district: 'Юнусабад',
    photos: [],
    status: 'ACTIVE',
  } as unknown as Listing;
}

describe('MyListings — promote gate', () => {
  it('кнопка «Продвинуть» скрыта, когда promotionsEnabled=false', () => {
    mockUsePromotionsEnabled.mockReturnValue(false);
    mockGetMyListings.mockReturnValue({
      data: { items: [makeListingNormal()], total: 1 },
      isLoading: false,
    });

    render(<MyListings />);
    expect(screen.queryByText('myListings.promote')).not.toBeInTheDocument();
  });

  it('кнопка «Продвинуть» видна, когда promotionsEnabled=true и promo=NORMAL', () => {
    mockUsePromotionsEnabled.mockReturnValue(true);
    mockGetMyListings.mockReturnValue({
      data: { items: [makeListingNormal()], total: 1 },
      isLoading: false,
    });

    render(<MyListings />);
    expect(screen.getByText('myListings.promote')).toBeInTheDocument();
  });
});
