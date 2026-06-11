/**
 * SessionBootstrap — гидрация текущего пользователя при загрузке.
 *
 * Если в store присутствует refresh-токен (восстановлен из localStorage в
 * authSlice.initialState), запрашиваем GET /auth/me, чтобы наполнить
 * user/profile. Без токена запрос пропускается (skip), чтобы не дёргать API
 * для анонимных гостей. Ничего не рендерит.
 */
'use client';

import { useGetMeQuery } from '@/store/api/authApi';
import { useAppSelector } from '@/store/hooks';
import { selectRefreshToken } from '@/store/slices/authSlice';

export function SessionBootstrap() {
  const refreshToken = useAppSelector(selectRefreshToken);
  useGetMeQuery(undefined, { skip: !refreshToken });
  return null;
}
