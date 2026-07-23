'use client';

import { useMemo } from 'react';
import { useAppSelector } from './hooks';
import { selectIsAuthenticated } from './slices/authSlice';
import { selectSocketConnected } from './realtimeSlice';
import { useGetThreadsQuery, type ApiThread } from './api/chatApi';
import { useGetNotificationsQuery } from './api/notificationsApi';
import {
  useGetIncomingToursQuery,
  type TourRequestItem,
} from './api/tourRequestsApi';

export interface UnreadCounts {
  messages: number;
  notifications: number;
  tours: number;
  total: number;
}

/** Pure: агрегирует непрочитанное из сырых данных запросов. */
export function computeUnreadCounts(
  threads: Pick<ApiThread, 'unread_count'>[] | undefined,
  notificationsUnread: number | undefined,
  incomingTours: Pick<TourRequestItem, 'status'>[] | undefined,
): UnreadCounts {
  const messages = (threads ?? []).reduce(
    (sum, t) => sum + (t.unread_count || 0),
    0,
  );
  const notifications = notificationsUnread ?? 0;
  const tours = (incomingTours ?? []).filter(
    (t) => t.status === 'PENDING',
  ).length;
  return { messages, notifications, tours, total: messages + notifications + tours };
}

export interface UseUnreadCountsOptions {
  /** Интервал поллинга (мс). 0 — без поллинга (только чтение кэша). */
  pollingInterval?: number;
}

/**
 * Живой сокет деградирует активный поллинг до safety-net 60с (сокет уже
 * доставляет обновления); 0 (читатели кэша без своего поллинга) остаётся 0,
 * чтобы не включать им поллинг заново.
 */
export const effectivePollingInterval = (
  requested: number,
  socketLive: boolean,
): number => (requested === 0 ? 0 : socketLive ? 60_000 : requested);

/**
 * Единый auth-aware источник счётчиков непрочитанного. Шапка вызывает с
 * pollingInterval (двигатель свежести), остальные потребители — без (читают
 * общий кэш; RTK дедуплицирует подписки на один endpoint).
 */
export function useUnreadCounts(
  opts: UseUnreadCountsOptions = {},
): UnreadCounts & { ready: boolean } {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const socketLive = useAppSelector(selectSocketConnected);
  const queryOpts = {
    skip: !isAuthenticated,
    pollingInterval: effectivePollingInterval(opts.pollingInterval ?? 0, socketLive),
    skipPollingIfUnfocused: true,
  } as const;

  const { data: threads, isSuccess: threadsReady } = useGetThreadsQuery(
    undefined,
    queryOpts,
  );
  const { data: notifications, isSuccess: notificationsReady } =
    useGetNotificationsQuery(undefined, queryOpts);
  const { data: incoming, isSuccess: incomingReady } = useGetIncomingToursQuery(
    undefined,
    queryOpts,
  );

  const ready = threadsReady && notificationsReady && incomingReady;

  return useMemo(
    () => ({
      ...computeUnreadCounts(threads, notifications?.unread, incoming),
      ready,
    }),
    [threads, notifications?.unread, incoming, ready],
  );
}
