'use client';

import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { selectAccessToken } from './slices/authSlice';
import { baseApi } from './api/baseApi';
import { connectSocket, disconnectSocket } from './socketClient';
import {
  ALL_REALTIME_TAGS,
  invalidationTagsFor,
  type RealtimeInvalidation,
} from './realtimeInvalidation';
import { setSocketConnected } from './realtimeSlice';

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

/**
 * Мост сокет↔RTK: (пере)подключается при появлении/ротации access-токена,
 * по событию `invalidate` дёргает invalidateTags → штатный REST-рефетч. При
 * reconnect инвалидирует все realtime-теги (gap-fill пропущенных за разрыв
 * ивентов). Логаут (token=null) → дисконнект. Монтируется один раз в layout.
 */
export function useRealtimeBridge(): void {
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectAccessToken);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      dispatch(setSocketConnected(false));
      return;
    }
    connectSocket(WS_URL, token, {
      onConnect: () => {
        dispatch(setSocketConnected(true));
        // gap-fill: подтянуть всё, что могли пропустить до/во время разрыва.
        dispatch(baseApi.util.invalidateTags(ALL_REALTIME_TAGS));
      },
      onDisconnect: () => dispatch(setSocketConnected(false)),
      onInvalidate: (payload: RealtimeInvalidation) =>
        dispatch(baseApi.util.invalidateTags(invalidationTagsFor(payload))),
    });
    return () => {
      disconnectSocket();
      dispatch(setSocketConnected(false));
    };
  }, [token, dispatch]);
}
