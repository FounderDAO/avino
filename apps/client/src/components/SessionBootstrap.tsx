/**
 * SessionBootstrap — определение сессии и гидрация пользователя при загрузке
 * (ADR-0153, TASK-256 PR-2).
 *
 * refresh-токен живёт в httpOnly cookie `avino_rt` и НЕ виден JS, поэтому на
 * старте мы не знаем синхронно, залогинен ли пользователь. Делаем пробный
 * silent-refresh: сервер ротирует по cookie и вернёт access (успех → сессия
 * есть, статус `authenticated`) либо 401 (гость → `unauthenticated`). Только
 * после `authenticated` дёргаем GET /auth/me за профилем/ролями. Ничего не
 * рендерит. Пока идёт проверка — статус `idle`, гейты ждут его разрешения.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useGetMeQuery, useRefreshMutation } from '@/store/api/authApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearCredentials, selectAuthStatus } from '@/store/slices/authSlice';

export function SessionBootstrap() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const [refresh] = useRefreshMutation();
  const ranRef = useRef(false);

  // Пробный silent-refresh ровно один раз на монтирование (StrictMode-safe).
  // Успех → setCredentials в onQueryStarted мутации; 401 → помечаем гостя.
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    refresh()
      .unwrap()
      .catch(() => dispatch(clearCredentials()));
  }, [refresh, dispatch]);

  // Профиль/роли — только когда сессия подтверждена silent-refresh'ем.
  useGetMeQuery(undefined, { skip: status !== 'authenticated' });

  return null;
}
