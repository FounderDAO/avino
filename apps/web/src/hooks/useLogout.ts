'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useLogoutMutation } from '@/store/api/authApi';
import { logOut, selectRefreshToken } from '@/store/slices/authSlice';

/**
 * useLogout — выход из админки.
 * Отзывает refresh на бэкенде (POST /auth/logout), чистит локальное состояние
 * (logOut: память + localStorage), редиректит на /admin/login. Сетевую ошибку
 * logout игнорируем — локально всё равно разлогиниваемся.
 */
export function useLogout() {
  const router = useRouter();
  const dispatch = useDispatch();
  const refreshToken = useSelector(selectRefreshToken);
  const [logoutMutation] = useLogoutMutation();

  return useCallback(async () => {
    try {
      if (refreshToken) {
        await logoutMutation({ refresh_token: refreshToken }).unwrap();
      }
    } catch {
      /* игнорируем — чистим локально в любом случае */
    } finally {
      dispatch(logOut());
      router.replace('/admin/login');
    }
  }, [refreshToken, logoutMutation, dispatch, router]);
}
