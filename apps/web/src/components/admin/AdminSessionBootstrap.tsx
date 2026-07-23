'use client';

import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useRefreshMutation } from '@/store/api/authApi';
import { logOut } from '@/store/slices/authSlice';

/**
 * AdminSessionBootstrap — определение сессии на старте админки (ADR-0153,
 * TASK-256 PR-3).
 *
 * refresh-токен живёт в httpOnly cookie `avino_rt` и не виден JS, поэтому на
 * старте делаем пробный silent-refresh: сервер ротирует по cookie и вернёт
 * access (успех → setTokens в onQueryStarted мутации → status authenticated)
 * либо 401 (гость → logOut → unauthenticated). RoleGuard ждёт этого разрешения,
 * прежде чем редиректить на /admin/login. Ничего не рендерит.
 */
export function AdminSessionBootstrap() {
  const dispatch = useDispatch();
  const [refresh] = useRefreshMutation();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    refresh()
      .unwrap()
      .catch(() => dispatch(logOut()));
  }, [refresh, dispatch]);

  return null;
}
