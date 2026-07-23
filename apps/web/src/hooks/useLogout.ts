'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { useLogoutMutation } from '@/store/api/authApi';
import { logOut } from '@/store/slices/authSlice';

/**
 * useLogout — выход из админки.
 * Отзывает сессию на бэкенде (POST /auth/logout без тела — family адресует
 * httpOnly cookie avino_rt, Bearer авторизует; ADR-0153), чистит локальное
 * состояние (logOut: память + status), редиректит на /admin/login. Сетевую
 * ошибку logout игнорируем — локально всё равно разлогиниваемся.
 */
export function useLogout() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [logoutMutation] = useLogoutMutation();

  return useCallback(async () => {
    try {
      await logoutMutation().unwrap();
    } catch {
      /* игнорируем — чистим локально в любом случае */
    } finally {
      dispatch(logOut());
      router.replace('/admin/login');
    }
  }, [logoutMutation, dispatch, router]);
}
