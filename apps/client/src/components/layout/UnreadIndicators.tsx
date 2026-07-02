/**
 * UnreadIndicators — иконки шапки: непрочит. сообщения (конверт → /account/inbox)
 * и уведомления (колокольчик → /account/notifications). Презентационный:
 * счётчики и поллинг/звук держит HeaderBody.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Mail, Bell } from 'lucide-react';
import { CountBadge } from '@/components/ui/count-badge';

const ICON =
  'relative flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-2';
const DOT = 'absolute -right-0.5 -top-0.5';

export interface UnreadIndicatorsProps {
  messages: number;
  notifications: number;
}

export function UnreadIndicators({ messages, notifications }: UnreadIndicatorsProps) {
  const t = useTranslations('nav');
  return (
    <>
      <Link
        href="/account/inbox"
        aria-label={messages > 0 ? `${t('messages')}: ${messages}` : t('messages')}
        className={ICON}
      >
        <Mail size={20} strokeWidth={1.9} />
        <CountBadge count={messages} className={DOT} max={9} />
      </Link>
      <Link
        href="/account/notifications"
        aria-label={
          notifications > 0
            ? `${t('notifications')}: ${notifications}`
            : t('notifications')
        }
        className={ICON}
      >
        <Bell size={20} strokeWidth={1.9} />
        <CountBadge count={notifications} className={DOT} max={9} />
      </Link>
    </>
  );
}
