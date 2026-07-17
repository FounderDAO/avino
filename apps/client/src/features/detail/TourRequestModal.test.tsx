import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

const createSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({ id: 'TR1' }) }));
let mockUser: unknown = { profile: { display_name: 'Tap Links', contact_phone: '+998901112233' }, email: 'a@b.c', phone: null };

vi.mock('@/store/hooks', () => ({ useAppSelector: (sel: (s: unknown) => unknown) => sel({ auth: { accessToken: 't', user: mockUser } }) }));
vi.mock('@/store/api/tourRequestsApi', () => ({
  useCreateTourRequestMutation: () => [createSpy, { isLoading: false }],
  useGetTakenSlotsQuery: () => ({ data: [], refetch: vi.fn() }),
}));
vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (k: string) => (ns ? ((ru as unknown as Record<string, Record<string, string>>)[ns]?.[k] ?? k) : k) }));

import { TourRequestModal } from './TourRequestModal';

const listing = { id: 'L1', title: 'X', toursEnabled: true, status: 'ACTIVE', tourWindows: [{ start: '07:00', end: '10:00' }] } as unknown as import('@/lib/mock/types').Listing;

describe('TourRequestModal', () => {
  beforeEach(() => { createSpy.mockClear(); });

  it('предзаполняет имя и телефон из профиля', () => {
    render(<TourRequestModal listing={listing} open onOpenChange={vi.fn()} />);
    expect((screen.getByLabelText(ru.tourRequest.name) as HTMLInputElement).value).toBe('Tap Links');
    expect((screen.getByLabelText(ru.tourRequest.phone) as HTMLInputElement).value).toBe('+998 90 111 22 33');
  });

  it('отправляет заявку с выбранными датой и окном', () => {
    render(<TourRequestModal listing={listing} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(ru.tourRequest.date), { target: { value: '2099-01-01' } });
    fireEvent.click(screen.getByText(ru.tourRequest.submit));
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      listing_id: 'L1', requested_date: '2099-01-01', window_start: '07:00', window_end: '10:00',
      requester_name: 'Tap Links', requester_phone: '+998901112233',
    }));
  });
});
