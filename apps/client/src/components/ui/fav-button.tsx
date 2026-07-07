/**
 * FavButton — круглая кнопка-сердечко (перенос FavBtn из ui.jsx).
 * Авторизован → переключает листинг в избранном. Гость → вместо «фантомного»
 * локального сохранения открываем LoginModal (нельзя добавить в избранное,
 * не войдя). Останавливает всплытие, чтобы не триггерить клик по карточке-ссылке.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsFavorite, useToggleFavorite } from '@/store/favorites';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { LoginModal } from '@/components/layout/LoginModal';

export interface FavButtonProps {
  /** id листинга для toggle в избранном. */
  listingId: string;
  /** Размер круга в px (по умолчанию 38). */
  size?: number;
  className?: string;
}

export function FavButton({ listingId, size = 38, className }: FavButtonProps) {
  const t = useTranslations('common');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const active = useIsFavorite(listingId);
  const toggle = useToggleFavorite();
  const [loginOpen, setLoginOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={active ? t('removeFromFavorites') : t('addToFavorites')}
        aria-pressed={active}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // Гость: не подсвечиваем «как сохранённое» — просим войти.
          if (!isAuthenticated) {
            setLoginOpen(true);
            return;
          }
          toggle(listingId);
        }}
        className={cn(
          'flex items-center justify-center rounded-full border-none shadow-[0_2px_8px_rgba(40,34,24,0.22)] transition-transform duration-150 active:scale-90',
          active ? 'bg-white text-red' : 'bg-white/90 text-ink',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Heart size={size * 0.5} strokeWidth={2.1} fill={active ? 'currentColor' : 'none'} />
      </button>

      {/* Условный монтаж: LoginModal тянет authApi-хуки — держим его вне DOM,
          пока гость не кликнул (важно на выдаче, где много FavButton). */}
      {loginOpen && (
        <LoginModal
          open={loginOpen}
          onOpenChange={setLoginOpen}
          context={t('loginToFavorite')}
        />
      )}
    </>
  );
}
