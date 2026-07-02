'use client';

import { useMemo } from 'react';
import { useAppSelector } from './hooks';
import { selectIsAuthenticated } from './slices/authSlice';
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
 * Единый auth-aware источник счётчиков непрочитанного. Шапка вызывает с
 * pollingInterval (двигатель свежести), остальные потребители — без (читают
 * общий кэш; RTK дедуплицирует подписки на один endpoint).
 */
export function useUnreadCounts(opts: UseUnreadCountsOptions = {}): UnreadCounts {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const queryOpts = {
    skip: !isAuthenticated,
    pollingInterval: opts.pollingInterval ?? 0,
    skipPollingIfUnfocused: true,
  } as const;

  const { data: threads } = useGetThreadsQuery(undefined, queryOpts);
  const { data: notifications } = useGetNotificationsQuery(undefined, queryOpts);
  const { data: incoming } = useGetIncomingToursQuery(undefined, queryOpts);

  return useMemo(
    () => computeUnreadCounts(threads, notifications?.unread, incoming),
    [threads, notifications?.unread, incoming],
  );
}
