/**
 * /account/[tab] — личный кабинет Avino (только моки, без авторизации).
 * Валидный tab ∈ {favorites, my-listings, saved, notifications, inbox, profile, settings, devices, tours}.
 * Невалидный → notFound(). Рендерит AccountLayout + контент активной вкладки.
 *
 * 'use client': часть вкладок завязана на стор/локальное состояние, поэтому
 * вся страница клиентская (params читаем через React.use в Next 15).
 */
'use client';

import * as React from 'react';
import { notFound } from 'next/navigation';
import { AccountLayout } from '@/features/account/AccountLayout';
import { Favorites } from '@/features/account/Favorites';
import { MyListings } from '@/features/account/MyListings';
import { SavedSearches } from '@/features/account/SavedSearches';
import { Notifications } from '@/features/account/Notifications';
import { Inbox } from '@/features/account/Inbox';
import { Profile } from '@/features/account/Profile';
import { Settings } from '@/features/account/Settings';
import { Devices } from '@/features/account/Devices';
import Tours from '@/features/account/Tours';

/** Карта «таб → компонент контента». Ключи = допустимые значения params.tab. */
const TAB_CONTENT: Record<string, React.ComponentType> = {
  'my-listings': MyListings,
  favorites: Favorites,
  saved: SavedSearches,
  inbox: Inbox,
  notifications: Notifications,
  profile: Profile,
  settings: Settings,
  devices: Devices,
  tours: Tours,
};

export default function AccountTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = React.use(params);
  const Content = TAB_CONTENT[tab];

  // Невалидный таб → 404
  if (!Content) notFound();

  return (
    <AccountLayout tab={tab}>
      <Content />
    </AccountLayout>
  );
}
