/**
 * Notifications — вкладка «Уведомления» (auth-aware, серверная лента).
 *
 * - Авторизован: рендерим уведомления из GET /notifications
 *   (useGetNotificationsQuery) с состояниями загрузки/пусто.
 *   Клик по непрочитанной карточке → POST /notifications/:id/read.
 *   «Прочитать все» → POST /notifications/read-all.
 * - Гость: серверный эндпоинт защищён (401) — показываем подсказку войти.
 *
 * Непрочитанные подсвечены красной левой полосой и точкой (флаг read_at/status).
 */
'use client';

import * as React from 'react';
import { Link } from '@/i18n/navigation';
import {
  Bell,
  Home,
  Mail,
  MessageCircle,
  Sparkles,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatter, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import {
  useGetNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  type NotificationType,
} from '@/store/api/notificationsApi';
import { notificationContent } from './notificationText';

/** Иконка по типу уведомления (Bell — безопасный дефолт). */
const TYPE_ICON: Record<NotificationType, LucideIcon> = {
  SAVED_SEARCH_NEW_LISTING: Bell,
  FAVORITE_PRICE_DROP: TrendingDown,
  NEW_CHAT_MESSAGE: MessageCircle,
  LISTING_MODERATION_STATUS_CHANGED: Home,
  NEW_LEAD: Mail,
  PROMOTION_ACTIVATED: Sparkles,
  PROMOTION_EXPIRED: Sparkles,
};

function iconFor(type: NotificationType): LucideIcon {
  return TYPE_ICON[type] ?? Bell;
}

export function Notifications() {
  const format = useFormatter();
  const t = useTranslations('account');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const { data, isLoading } = useGetNotificationsQuery(undefined, {
    skip: !isAuthenticated,
  });

  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading: isMarkingAll }] =
    useMarkAllNotificationsReadMutation();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const header = (action?: React.ReactNode) => (
    <div className="mb-[18px] flex items-center justify-between">
      <h1 className="text-[28px]">{t('notifications.title')}</h1>
      {action}
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div>
        {header()}
        <EmptyState
          icon={Bell}
          title={t('notifications.authTitle')}
          text={t('notifications.authText')}
          action={
            <Button asChild>
              {/* Вход — модалка в Header; /login-маршрута нет. */}
              <Link href="/">{t('notifications.goHome')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        {header()}
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[78px] rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        {header()}
        <EmptyState icon={Bell} title={t('notifications.empty')} />
      </div>
    );
  }

  return (
    <div>
      {header(
        unread > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isMarkingAll}
            onClick={() => void markAll()}
          >
            {t('notifications.readAll')}
          </Button>
        ) : null,
      )}

      <div className="flex flex-col gap-2.5">
        {items.map((n) => {
          const read = n.read_at != null || n.status === 'READ';
          const Icon = iconFor(n.type);
          // Бэкенд хранит title/body = null (текст рендерил бы воркер-стаб);
          // собираем текст из type + data_json. Серверный текст — приоритетный
          // фолбэк на будущее (когда воркер начнёт его заполнять).
          const fallback = notificationContent(n.type, n.data_json, t);
          const title = n.title?.trim() || fallback.title;
          const body = n.body?.trim() || fallback.body;
          return (
            <div
              key={n.id}
              onClick={() => {
                if (!read) void markRead(n.id);
              }}
              className={cn(
                'flex cursor-pointer items-start gap-3.5 rounded-card bg-surface px-4 py-3.5 shadow-card',
                read ? 'border border-border/60' : 'border-l-[3px] border-red',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-teal">
                <Icon size={20} strokeWidth={1.9} />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2.5">
                  <b className="text-[15px]">{title}</b>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {format.relativeTime(new Date(n.created_at))}
                  </span>
                </div>
                <p className="mt-[3px] text-sm text-muted-foreground">{body}</p>
              </div>
              {!read && (
                <span className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-red" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
