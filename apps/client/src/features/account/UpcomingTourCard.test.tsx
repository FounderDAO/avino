import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';
import type { TourRequestItem } from '@/store/api/tourRequestsApi';

const updateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

vi.mock('@/store/api/tourRequestsApi', () => ({
  useUpdateTourStatusMutation: () => [updateSpy, { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (p: any) => <a href={p.href}>{p.children}</a>,
}));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { UpcomingTourCard } from './UpcomingTourCard';

const hostItem: TourRequestItem = {
  id: 'T1',
  listing_id: 'L1',
  requester_id: 'R1',
  status: 'CONFIRMED',
  requested_date: '2099-01-01',
  window_start: '07:00',
  window_end: '10:00',
  requester_name: 'Гость Иван',
  requester_phone: '+998900000001',
  message: null,
  created_at: '',
  listing: { id: 'L1', title: 'Квартира на Чиланзаре', photo_url: null },
};

const guestItem: TourRequestItem = {
  id: 'T2',
  listing_id: 'L2',
  requester_id: 'R2',
  status: 'CONFIRMED',
  requested_date: '2099-02-02',
  window_start: '18:00',
  window_end: '20:00',
  requester_name: 'Me',
  requester_phone: '+998900000002',
  message: null,
  created_at: '',
  listing: { id: 'L2', title: 'Дом в Юнусабаде', photo_url: null },
  owner: { name: 'Владелец Пётр', phone: '+998900000003' },
};

describe('UpcomingTourCard', () => {
  it('role=host: показывает имя гостя, «Отменить» вызывает мутацию с action DECLINE', () => {
    render(<UpcomingTourCard item={hostItem} role="host" />);
    expect(screen.getByText('Гость Иван')).toBeInTheDocument();
    fireEvent.click(screen.getByText(ru.account.tours.cancel));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'T1', action: 'DECLINE' });
  });

  it('role=guest: показывает владельца (имя и телефон), «Отменить» вызывает мутацию с action CANCEL', () => {
    render(<UpcomingTourCard item={guestItem} role="guest" />);
    expect(screen.getByText('Владелец Пётр')).toBeInTheDocument();
    expect(screen.getByText('+998900000003')).toBeInTheDocument();
    fireEvent.click(screen.getByText(ru.account.tours.cancel));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'T2', action: 'CANCEL' });
  });

  it('role=guest без owner: рендерится без падения', () => {
    const { owner: _owner, ...withoutOwner } = guestItem;
    expect(() =>
      render(<UpcomingTourCard item={withoutOwner as TourRequestItem} role="guest" />),
    ).not.toThrow();
  });
});
