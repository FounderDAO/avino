import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

const updateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const outgoing = [{ id: 'O1', listing_id: 'L1', status: 'PENDING', requested_date: '2099-01-01', window_start: '07:00', window_end: '10:00', requester_name: 'Me', requester_phone: 'x', message: null, created_at: '' }];
const incoming = [{ id: 'I1', listing_id: 'L2', status: 'PENDING', requested_date: '2099-02-02', window_start: '18:00', window_end: '20:00', requester_name: 'Buyer', requester_phone: 'y', message: null, created_at: '' }];

vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/tourRequestsApi', () => ({
  useGetOutgoingToursQuery: () => ({ data: outgoing, isLoading: false, isError: false }),
  useGetIncomingToursQuery: () => ({ data: incoming, isLoading: false, isError: false }),
  useUpdateTourStatusMutation: () => [updateSpy, { isLoading: false }],
}));
vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (k: string) => k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k }));

import Tours from './Tours';

describe('Tours', () => {
  it('рендерит входящую заявку и подтверждает её', () => {
    render(<Tours />);
    expect(screen.getByText('Buyer')).toBeInTheDocument();
    fireEvent.click(screen.getByText(ru.account.tours.confirm));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'I1', action: 'CONFIRM' });
  });

  it('покупатель может отменить свою заявку', () => {
    render(<Tours />);
    fireEvent.click(screen.getByText(ru.account.tours.cancel));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'O1', action: 'CANCEL' });
  });
});
