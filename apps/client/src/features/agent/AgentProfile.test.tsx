/**
 * Тесты AgentProfile: рендер шапки профиля + сетки объявлений по фикстурам.
 *
 * next-intl НЕ мокируется вручную — рендерим через настоящий
 * NextIntlClientProvider с реальным messages/ru.json (как в
 * LimitReachedModal.test.tsx/SaveSearchModal.test.tsx), чтобы ICU
 * plural (`agentProfile.listingsCount`) раскрывался по-настоящему, а не
 * подменялся упрощённым `{count}`-мок-резолвером. Зависимости PropertyCard
 * (фото/промо/избранное/цена) мокируем — как в PropertyCard.test.tsx.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ru from '../../../messages/ru.json';
import type { Agent } from '@/lib/api/agents';
import type { Listing } from '@/lib/mock/types';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/usePriceFormatter', () => ({
  usePriceFormatter: () => ({ price: () => '$108 223' }),
}));
vi.mock('@/components/ui/card-photo-carousel', () => ({
  CardPhotoCarousel: () => <div data-testid="photo" />,
}));
vi.mock('@/components/ui/promo-badge', () => ({
  PromoBadge: () => null,
  DaysBadge: () => null,
}));
vi.mock('@/components/ui/fav-button', () => ({
  FavButton: () => <button aria-label="fav" />,
}));

import { AgentProfile } from './AgentProfile';

/** Рендер с реальным next-intl провайдером (ICU plural резолвится по-настоящему). */
function renderProfile(props: React.ComponentProps<typeof AgentProfile>) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <AgentProfile {...props} />
    </NextIntlClientProvider>,
  );
}

const AGENT: Agent = {
  id: 'ag-1',
  name: 'Дилноза Каримова',
  avatarUrl: 'https://cdn.avino.uz/ag-1/avatar.webp',
  agencyName: 'Estate Group',
  about: 'Более 10 лет на рынке недвижимости Ташкента.',
  activeListingsCount: 2,
};

const LISTINGS: Listing[] = [
  {
    id: 'l1',
    title: 'Квартира у метро',
    tx: 'SALE',
    type: 'APARTMENT',
    rooms: 3,
    area: 90,
    floor: 4,
    totalFloors: 9,
    district: 'Яшнабад',
    address: 'ул. Тестовая 1',
    createdAt: '2000-01-01T00:00:00.000Z',
    promo: 'NORMAL',
    photos: [{ thumb: '' }],
    agent: { name: '', agency: '', pro: false },
  } as unknown as Listing,
  {
    id: 'l2',
    title: 'Дом с участком',
    tx: 'SALE',
    type: 'HOUSE',
    rooms: 5,
    area: 200,
    district: 'Мирзо-Улугбек',
    address: 'ул. Другая 2',
    createdAt: '2000-01-02T00:00:00.000Z',
    promo: 'NORMAL',
    photos: [{ thumb: '' }],
    agent: { name: '', agency: '', pro: false },
  } as unknown as Listing,
];

describe('AgentProfile (публичный профиль агента, Task 5)', () => {
  it('рендерит шапку профиля: имя, агентство, счётчик объявлений, о себе', () => {
    renderProfile({ agent: AGENT, listings: LISTINGS });

    expect(screen.getByRole('heading', { level: 1, name: 'Дилноза Каримова' })).toBeInTheDocument();
    expect(screen.getByText('Estate Group')).toBeInTheDocument();
    // activeListingsCount: 2 → форма «few» (2-4) в русском ICU plural.
    expect(screen.getByText('2 объявления')).toBeInTheDocument();
    expect(
      screen.getByText('Более 10 лет на рынке недвижимости Ташкента.'),
    ).toBeInTheDocument();
  });

  it('рендерит сетку карточек объявлений (PropertyCard) со ссылками на /listing/:id', () => {
    renderProfile({ agent: AGENT, listings: LISTINGS });

    const links = screen.getAllByRole('link', { name: /\$108 223/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/listing/l1');
    expect(links[1]).toHaveAttribute('href', '/listing/l2');
  });

  it('agencyName = null → показывается «Частный маклер»', () => {
    renderProfile({ agent: { ...AGENT, agencyName: null }, listings: LISTINGS });
    expect(screen.getByText('Частный маклер')).toBeInTheDocument();
    expect(screen.queryByText('Estate Group')).not.toBeInTheDocument();
  });

  it('name = null → заголовок имени скрыт', () => {
    renderProfile({ agent: { ...AGENT, name: null }, listings: LISTINGS });
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('about = null → блок «О себе» скрыт', () => {
    renderProfile({ agent: { ...AGENT, about: null }, listings: LISTINGS });
    expect(screen.queryByText(AGENT.about!)).not.toBeInTheDocument();
  });

  it('пустой список объявлений → пустое состояние вместо сетки', () => {
    renderProfile({ agent: AGENT, listings: [] });
    expect(screen.queryAllByRole('link', { name: /\$108 223/ })).toHaveLength(0);
  });

  it('listingsCount — корректная ICU-плюрализация для 1/2/5 объявлений (ru)', () => {
    const { unmount: u1 } = renderProfile({
      agent: { ...AGENT, activeListingsCount: 1 },
      listings: LISTINGS,
    });
    expect(screen.getByText('1 объявление')).toBeInTheDocument();
    u1();

    const { unmount: u2 } = renderProfile({
      agent: { ...AGENT, activeListingsCount: 2 },
      listings: LISTINGS,
    });
    expect(screen.getByText('2 объявления')).toBeInTheDocument();
    u2();

    renderProfile({ agent: { ...AGENT, activeListingsCount: 5 }, listings: LISTINGS });
    expect(screen.getByText('5 объявлений')).toBeInTheDocument();
  });
});
