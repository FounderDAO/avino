/**
 * AccountLayout — оболочка личного кабинета: боковая навигация по вкладкам
 * + контент активной вкладки. Подсветка активной по совпадению с `tab`.
 *
 * Карточка пользователя берёт РЕАЛЬНОГО текущего юзера из Redux
 * (selectCurrentUser, тот же источник, что и Header) — display_name → имя →
 * телефон. Гость (нет сессии) → нейтральная подпись.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CalendarDays, Home, Heart, Bell, MessageCircle, User, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/slices/authSlice';

/** Описание вкладки кабинета. */
export interface AccountTab {
  key: string;
  /** Ключ подписи в словаре account.tabs.*. */
  labelKey: string;
  icon: typeof Home;
}

/** Список вкладок и их порядок в боковой навигации. */
export const ACCOUNT_TABS: AccountTab[] = [
  { key: 'my-listings', labelKey: 'myListings', icon: Home },
  { key: 'favorites', labelKey: 'favorites', icon: Heart },
  { key: 'saved', labelKey: 'saved', icon: Bell },
  { key: 'inbox', labelKey: 'inbox', icon: MessageCircle },
  { key: 'notifications', labelKey: 'notifications', icon: Bell },
  { key: 'profile', labelKey: 'profile', icon: User },
  { key: 'settings', labelKey: 'settings', icon: SettingsIcon },
  { key: 'tours', labelKey: 'tours', icon: CalendarDays },
];

export interface AccountLayoutProps {
  /** Активная вкладка (из params.tab). */
  tab: string;
  children: React.ReactNode;
}

export function AccountLayout({ tab, children }: AccountLayoutProps) {
  const t = useTranslations('account');
  const user = useAppSelector(selectCurrentUser);

  // Подпись аккаунта: display_name → имя → телефон → «Гость» (как в Header).
  const accountName =
    user?.profile?.display_name ??
    user?.profile?.first_name ??
    user?.phone ??
    t('userCard.guest');
  const accountPhone = user?.profile?.contact_phone ?? user?.phone ?? null;
  const initial = accountName.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-7">
      <div className="grid items-start gap-8 md:grid-cols-[248px_1fr]">
        {/* Боковая навигация */}
        <aside>
          {/* Карточка пользователя (реальный текущий юзер из Redux) */}
          <div className="flex items-center gap-3 px-1.5 pb-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal text-lg font-extrabold text-white">
              {initial}
            </span>
            <div className="min-w-0">
              <div className="truncate font-bold">{accountName}</div>
              {accountPhone && (
                <div className="text-[12.5px] text-muted-foreground">{accountPhone}</div>
              )}
            </div>
          </div>

          <nav className="flex flex-col gap-0.5">
            {ACCOUNT_TABS.map((item) => {
              const on = tab === item.key;
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={`/account/${item.key}`}
                  className={cn(
                    'flex items-center gap-3 whitespace-nowrap rounded-[10px] px-3.5 py-[11px] text-[14.5px]',
                    on
                      ? 'bg-mint font-bold text-teal-deep'
                      : 'font-semibold text-ink hover:bg-surface-2',
                  )}
                >
                  <Icon size={19} strokeWidth={1.9} className="shrink-0" />{' '}
                  {t(`tabs.${item.labelKey}`)}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Контент активной вкладки */}
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
