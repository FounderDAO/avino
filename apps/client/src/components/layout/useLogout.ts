/**
 * useLogout — общая логика выхода для шапки (десктоп-меню ProfileMenu и
 * мобильное полноэкранное меню Header). Отзывает refresh-токен (clearCredentials
 * чистит локальные креды в onQueryStarted независимо от исхода) и уводит на «/».
 */
'use client';

import * as React from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import { selectRefreshToken } from '@/store/slices/authSlice';
import { useLogoutMutation } from '@/store/api/authApi';

export function useLogout(): {
  logout: () => Promise<void>;
  isLoggingOut: boolean;
} {
  const router = useRouter();
  const refreshToken = useAppSelector(selectRefreshToken);
  const [logoutMutation, { isLoading: isLoggingOut }] = useLogoutMutation();

  const logout = React.useCallback(async () => {
    try {
      await logoutMutation({ refresh_token: refreshToken ?? '' });
    } finally {
      router.push('/');
    }
  }, [logoutMutation, refreshToken, router]);

  return { logout, isLoggingOut };
}
