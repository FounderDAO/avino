/**
 * useLogout — общая логика выхода для шапки (десктоп-меню ProfileMenu и
 * мобильное полноэкранное меню Header). Отзывает сессию: `/auth/logout` без тела
 * — family адресует cookie `avino_rt`, Bearer авторизует (ADR-0153). Локальные
 * креды чистит clearCredentials в onQueryStarted независимо от исхода; уводит на «/».
 */
'use client';

import * as React from 'react';
import { useRouter } from '@/i18n/navigation';
import { useLogoutMutation } from '@/store/api/authApi';

export function useLogout(): {
  logout: () => Promise<void>;
  isLoggingOut: boolean;
} {
  const router = useRouter();
  const [logoutMutation, { isLoading: isLoggingOut }] = useLogoutMutation();

  const logout = React.useCallback(async () => {
    try {
      await logoutMutation();
    } finally {
      router.push('/');
    }
  }, [logoutMutation, router]);

  return { logout, isLoggingOut };
}
