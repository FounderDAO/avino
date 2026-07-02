import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

const updateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
vi.mock('@/store/api/tourRequestsApi', () => ({
  useUpdateTourStatusMutation: () => [updateSpy, { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({ Link: (p: any) => <a href={p.href}>{p.children}</a> }));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { IncomingTourModal } from './IncomingTourModal';

const base = {
  id: 'I1', listing_id: 'L2', requester_id: 'R1', status: 'PENDING' as const,
  requested_date: '2099-02-02', window_start: '18:00', window_end: '20:00',
  requester_name: 'Buyer', requester_phone: '+998900000000',
  message: 'Хочу посмотреть вечером', created_at: '',
};

describe('IncomingTourModal', () => {
  it('показывает сообщение и подтверждает запрос', () => {
    const onClose = vi.fn();
    render(<IncomingTourModal item={base} onClose={onClose} />);
    expect(screen.getByText('Хочу посмотреть вечером')).toBeInTheDocument();
    fireEvent.click(screen.getByText(ru.account.tours.confirm));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'I1', action: 'CONFIRM' });
  });

  it('показывает «Без сообщения» когда message пустой', () => {
    render(<IncomingTourModal item={{ ...base, message: null }} onClose={vi.fn()} />);
    expect(screen.getByText(ru.account.tours.noMessage)).toBeInTheDocument();
  });

  it('не показывает кнопки действий для не-PENDING', () => {
    render(<IncomingTourModal item={{ ...base, status: 'CONFIRMED' }} onClose={vi.fn()} />);
    expect(screen.queryByText(ru.account.tours.confirm)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.account.tours.decline)).not.toBeInTheDocument();
  });

  it('не рендерит содержимое когда item = null', () => {
    render(<IncomingTourModal item={null} onClose={vi.fn()} />);
    expect(screen.queryByText(ru.account.tours.modalTitle)).not.toBeInTheDocument();
  });
});
