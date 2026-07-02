/**
 * ProfileMenu — выпадающее меню профиля в шапке (стиль OLX).
 * Рендерится только в залогиненном состоянии (Header гардит по isAuthenticated).
 * Триггер «Ваш профиль» (БЕЗ имени); панель — контакт + пункты аккаунта +
 * секция «Избранные» со счётчиками + «Выйти». Переиспользует Radix Dropdown.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { User, ChevronDown } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import {
  selectIsAuthenticated,
  selectCurrentUser,
} from '@/store/slices/authSlice';
import { useFavoritesCount } from '@/store/favorites';
import { useGetSavedSearchesQuery } from '@/store/api/savedSearchesApi';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from '@/components/ui/dropdown';
import { useLogout } from './useLogout';

type MenuLink = { key: string; href: string; labelKey: string };

/** Основные пункты — переиспользуются мобильным меню Header. */
export const PROFILE_MENU_LINKS: MenuLink[] = [
  { key: 'profile', href: '/account/profile', labelKey: 'profileMenu.profile' },
  { key: 'listings', href: '/account/my-listings', labelKey: 'profileMenu.listings' },
  { key: 'chat', href: '/account/inbox', labelKey: 'profileMenu.chat' },
  { key: 'settings', href: '/account/settings', labelKey: 'profileMenu.settings' },
];

/** Пункты секции «Избранные». */
export const FAVORITE_MENU_LINKS: MenuLink[] = [
  { key: 'favListings', href: '/account/favorites', labelKey: 'profileMenu.favListings' },
  { key: 'favSearches', href: '/account/saved', labelKey: 'profileMenu.favSearches' },
];

/** Контакт для шапки панели: email-локалpart → телефон → запасной текст. Имя НЕ используется. */
export function contactLabel(
  user: { email: string | null; phone: string | null } | null | undefined,
  fallback: string,
): string {
  const email = user?.email;
  if (email && email.includes('@')) return email.split('@')[0];
  if (user?.phone) return user.phone;
  return fallback;
}

function CountPill({ n }: { n: number }) {
  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-surface-2 px-1.5 text-xs font-bold text-muted-foreground">
      {n}
    </span>
  );
}

export function ProfileMenu() {
  const t = useTranslations('nav');
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const favCount = useFavoritesCount();
  const { data: savedSearches } = useGetSavedSearchesQuery(undefined, {
    skip: !isAuthenticated,
  });
  const savedCount = savedSearches?.length ?? 0;
  const { logout, isLoggingOut } = useLogout();

  const label = contactLabel(currentUser, t('account'));
  const avatarUrl = currentUser?.profile?.avatar_url ?? null;
  const initial = /^[\p{L}]/u.test(label) ? label[0].toUpperCase() : null;
  const favCounts: Record<string, number> = {
    favListings: favCount,
    favSearches: savedCount,
  };

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-pill px-3 py-2 text-[15px] font-semibold text-ink hover:bg-surface-2"
        >
          <User size={20} strokeWidth={1.9} />
          <span>{t('profileMenu.trigger')}</span>
          <ChevronDown size={16} strokeWidth={2} />
        </button>
      </DropdownTrigger>

      <DropdownContent className="min-w-[240px]">
        {/* Идентичность — контакт, без имени */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-sm font-bold text-teal">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : initial ? (
              initial
            ) : (
              <User size={18} strokeWidth={1.9} />
            )}
          </span>
          <span className="truncate text-[15px] font-bold text-ink">{label}</span>
        </div>

        <div className="-mx-1.5 my-1 h-px bg-border" />

        {/* Секция «Ваш профиль» */}
        <div className="px-3 pb-1 pt-1 text-[13px] font-bold text-muted-foreground">
          {t('profileMenu.sectionMain')}
        </div>
        {PROFILE_MENU_LINKS.map((it) => (
          <DropdownItem key={it.key} onSelect={() => router.push(it.href)}>
            {t(it.labelKey)}
          </DropdownItem>
        ))}

        {/* Секция «Избранные» */}
        <div className="px-3 pb-1 pt-2 text-[13px] font-bold text-muted-foreground">
          {t('profileMenu.favorites')}
        </div>
        {FAVORITE_MENU_LINKS.map((it) => (
          <DropdownItem
            key={it.key}
            onSelect={() => router.push(it.href)}
            trailing={<CountPill n={favCounts[it.key] ?? 0} />}
          >
            {t(it.labelKey)}
          </DropdownItem>
        ))}

        <div className="-mx-1.5 my-1 h-px bg-border" />

        <DropdownItem
          disabled={isLoggingOut}
          onSelect={() => {
            void logout();
          }}
        >
          {t('logout')}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
