/**
 * AccountLayout — оболочка личного кабинета: боковая навигация по вкладкам
 * + контент активной вкладки. Подсветка активной по совпадению с `tab`.
 * Все вкладки — мок-данные (как будто пользователь вошёл), без API/авторизации.
 */
'use client';

import * as React from 'react';
import { Link } from '@/i18n/navigation';
import { Home, Heart, Bell, MessageCircle, User, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Описание вкладки кабинета. */
export interface AccountTab {
  key: string;
  label: string;
  icon: typeof Home;
}

/** Список вкладок и их порядок в боковой навигации. */
export const ACCOUNT_TABS: AccountTab[] = [
  { key: 'my-listings', label: 'Мои объявления', icon: Home },
  { key: 'favorites', label: 'Избранное', icon: Heart },
  { key: 'saved', label: 'Сохранённые поиски', icon: Bell },
  { key: 'inbox', label: 'Сообщения', icon: MessageCircle },
  { key: 'notifications', label: 'Уведомления', icon: Bell },
  { key: 'profile', label: 'Профиль', icon: User },
  { key: 'settings', label: 'Настройки', icon: SettingsIcon },
];

export interface AccountLayoutProps {
  /** Активная вкладка (из params.tab). */
  tab: string;
  children: React.ReactNode;
}

export function AccountLayout({ tab, children }: AccountLayoutProps) {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-7">
      <div className="grid items-start gap-8 md:grid-cols-[248px_1fr]">
        {/* Боковая навигация */}
        <aside>
          {/* Карточка пользователя (мок) */}
          <div className="flex items-center gap-3 px-1.5 pb-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal text-lg font-extrabold text-white">
              А
            </span>
            <div>
              <div className="font-bold">Алишер</div>
              <div className="text-[12.5px] text-muted-foreground">+998 90 •• 67</div>
            </div>
          </div>

          <nav className="flex flex-col gap-0.5">
            {ACCOUNT_TABS.map((t) => {
              const on = tab === t.key;
              const Icon = t.icon;
              return (
                <Link
                  key={t.key}
                  href={`/account/${t.key}`}
                  className={cn(
                    'flex items-center gap-3 whitespace-nowrap rounded-[10px] px-3.5 py-[11px] text-[14.5px]',
                    on
                      ? 'bg-mint font-bold text-teal-deep'
                      : 'font-semibold text-ink hover:bg-surface-2',
                  )}
                >
                  <Icon size={19} strokeWidth={1.9} className="shrink-0" /> {t.label}
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
