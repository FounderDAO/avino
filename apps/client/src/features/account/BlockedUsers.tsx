/**
 * BlockedUsers — вкладка «Заблокированные»: список заблокированных пользователей
 * (Apple 1.2, GET/DELETE /blocks, Task 5). Заблокированный пользователь скрыт из
 * чата и выдачи (blocksApi инвалидирует Block+Chat+Search на create/delete).
 *
 * - Гость: эндпоинт Bearer-only (401) — показываем подсказку войти (как Devices).
 * - «Разблокировать» → DELETE /blocks/:id → toast, строка уходит по инвалидации
 *   тега Block. Дизейбл — по конкретной строке (unblockingId), а не глобально,
 *   чтобы клик по одному пользователю не блокировал остальные (см. Devices.tsx).
 */
'use client';

import * as React from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Ban } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import { useDeleteBlockMutation, useGetBlocksQuery } from '@/store/api/blocksApi';

export function BlockedUsers() {
  const t = useTranslations('account.blocked');
  const format = useFormatter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const { data, isLoading } = useGetBlocksQuery(undefined, {
    skip: !isAuthenticated,
  });
  const [deleteBlock] = useDeleteBlockMutation();
  const [unblockingId, setUnblockingId] = React.useState<string | null>(null);

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      await deleteBlock(userId).unwrap();
      toast.success(t('unblocked'));
    } catch {
      toast.error(t('unblock'));
    } finally {
      setUnblockingId(null);
    }
  };

  const header = (
    <div className="mb-[18px]">
      <h1 className="text-[28px]">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Ban}
          title={t('authTitle')}
          text={t('authText')}
          action={
            <Button asChild>
              {/* Вход — модалка в Header; /login-маршрута нет. */}
              <Link href="/">{t('goHome')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        {header}
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  const blocks = data?.data ?? [];

  if (blocks.length === 0) {
    return (
      <div>
        {header}
        <EmptyState icon={Ban} title={t('empty')} />
      </div>
    );
  }

  return (
    <div className="max-w-[640px]">
      {header}
      <div className="flex flex-col gap-2.5">
        {blocks.map((b) => {
          const displayName = b.name ?? t('anonymous');
          return (
            <div
              key={b.user_id}
              className="flex items-center gap-3.5 rounded-card border border-border/60 bg-surface px-4 py-3.5 shadow-card"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-teal">
                {b.avatar_url ? (
                  // Аватар другого пользователя: произвольный внешний хост
                  // (в т.ч. googleusercontent.com у OAuth-юзеров), не всегда
                  // в whitelist next.config images.remotePatterns — как в
                  // AccountLayout, используем обычный <img>, а не next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[15px] font-extrabold">
                    {displayName.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">{displayName}</div>
                <div className="mt-[3px] text-sm text-muted-foreground">
                  {format.dateTime(new Date(b.blocked_at), { dateStyle: 'medium' })}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={unblockingId === b.user_id}
                onClick={() => void handleUnblock(b.user_id)}
              >
                {t('unblock')}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
