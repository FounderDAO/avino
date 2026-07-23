import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

const updateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const fetchNextIncoming = vi.fn();
const fetchNextOutgoing = vi.fn();
const outgoing = [{ id: 'O1', listing_id: 'L1', requester_id: 'R0', status: 'PENDING', requested_date: '2099-01-01', window_start: '07:00', window_end: '10:00', requester_name: 'Me', requester_phone: 'x', message: null, created_at: '', listing: { id: 'L1', title: 'Квартира на Чиланзаре', photo_url: null } }];
const incoming = [{ id: 'I1', listing_id: 'L2', requester_id: 'R1', status: 'PENDING', requested_date: '2099-02-02', window_start: '18:00', window_end: '20:00', requester_name: 'Buyer', requester_phone: 'y', message: 'Здравствуйте', created_at: '', listing: { id: 'L2', title: 'Дом в Юнусабаде', photo_url: null } }];

// hasNextPage управляется из тестов, чтобы проверить кнопку «Показать ещё».
const incomingState = { hasNextPage: false };

vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/tourRequestsApi', () => ({
  // upcoming-запрос (массив-хук с параметрами) в этом тесте всегда пуст — фикстуры PENDING, не CONFIRMED.
  useGetOutgoingToursQuery: (params: unknown) => ({ data: params ? [] : outgoing, isLoading: false, isError: false }),
  useGetIncomingToursQuery: (params: unknown) => ({ data: params ? [] : incoming, isLoading: false, isError: false }),
  useGetIncomingToursPageInfiniteQuery: () => ({
    data: { pages: [{ items: incoming, nextCursor: null }] },
    fetchNextPage: fetchNextIncoming,
    hasNextPage: incomingState.hasNextPage,
    isFetchingNextPage: false,
  }),
  useGetOutgoingToursPageInfiniteQuery: () => ({
    data: { pages: [{ items: outgoing, nextCursor: null }] },
    fetchNextPage: fetchNextOutgoing,
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useUpdateTourStatusMutation: () => [updateSpy, { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (p: any) => <a href={p.href}>{p.children}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (k: string) => k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k }));

import Tours from './Tours';

/** Переключает активную вкладку по её подписи. */
function openTab(label: string) {
  fireEvent.click(screen.getByText(label));
}

describe('Tours', () => {
  it('клик по строке входящего запроса открывает модалку с сообщением', () => {
    render(<Tours />);
    openTab(ru.account.tours.incoming);
    fireEvent.click(screen.getByText('Buyer'));
    expect(screen.getByText(ru.account.tours.modalTitle)).toBeInTheDocument();
    expect(screen.getByText('Здравствуйте')).toBeInTheDocument();
  });

  it('инлайн «Подтвердить» вызывает мутацию и НЕ открывает модалку', () => {
    render(<Tours />);
    openTab(ru.account.tours.incoming);
    fireEvent.click(screen.getAllByText(ru.account.tours.confirm)[0]);
    expect(updateSpy).toHaveBeenCalledWith({ id: 'I1', action: 'CONFIRM' });
    expect(screen.queryByText(ru.account.tours.modalTitle)).not.toBeInTheDocument();
  });

  it('покупатель может отменить свою заявку', () => {
    render(<Tours />);
    openTab(ru.account.tours.outgoing);
    fireEvent.click(screen.getByText(ru.account.tours.cancel));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'O1', action: 'CANCEL' });
  });

  it('«Показать ещё» рендерится только при hasNextPage и вызывает fetchNextPage', () => {
    incomingState.hasNextPage = true;
    render(<Tours />);
    openTab(ru.account.tours.incoming);
    const btn = screen.getByText(ru.account.tours.loadMore);
    fireEvent.click(btn);
    expect(fetchNextIncoming).toHaveBeenCalled();
    incomingState.hasNextPage = false;
  });
});
