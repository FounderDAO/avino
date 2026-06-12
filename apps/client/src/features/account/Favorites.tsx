/**
 * Favorites — вкладка «Избранное» (auth-aware).
 *
 * - Авторизован: рендерим листинги напрямую из серверного GET /favorites
 *   (useGetFavoritesQuery) с состояниями загрузки/ошибки/пусто.
 * - Гость: серверный эндпоинт защищён (401), поэтому показываем подсказку
 *   войти — гостевые id-избранного (localStorage) пока не резолвятся в карточки
 *   на бэке. См. TODO(fav-merge-on-login) в store/favorites.ts.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Heart } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { useGetFavoritesQuery } from '@/store/api/favoritesApi';
import { PropertyCard } from '@/features/search/PropertyCard';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function Favorites() {
  const t = useTranslations('account');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const {
    data: items,
    isLoading,
    isError,
  } = useGetFavoritesQuery(undefined, { skip: !isAuthenticated });

  const count = isAuthenticated ? (items?.length ?? 0) : 0;

  return (
    <div>
      <h1 className="mb-[18px] text-[28px]">
        {t('favorites.title')}{' '}
        <span className="text-lg font-semibold text-muted-foreground">· {count}</span>
      </h1>

      {!isAuthenticated ? (
        <EmptyState
          icon={Heart}
          title={t('favorites.authTitle')}
          text={t('favorites.authText')}
          action={
            <Button asChild>
              {/* Вход — модалка в Header; /login-маршрута нет. TODO(account-auth-guard). */}
              <Link href="/">{t('favorites.goHome')}</Link>
            </Button>
          }
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[320px]" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={Heart}
          title={t('favorites.errorTitle')}
          text={t('favorites.errorText')}
        />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={t('favorites.emptyTitle')}
          text={t('favorites.emptyText')}
          action={
            <Button asChild>
              <Link href="/search">{t('favorites.startSearch')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((l) => (
            <PropertyCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}
