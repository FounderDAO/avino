/**
 * Devices — вкладка «Устройства»: активные сессии пользователя
 * (GET /auth/sessions, ADR-0143/ADR-0145).
 *
 * - Гость: эндпоинт Bearer-only (401) — показываем подсказку войти.
 * - Карточка: устройство из user_agent (sessionDevice), IP, вход (created_at),
 *   активность (last_rotated_at), бейдж «Текущая сессия» (is_current).
 * - «Завершить» — только у не-текущих (завершение текущей = logout, он в шапке).
 *   confirm → DELETE → toast; 404 = «уже завершена» (идемпотентный контракт),
 *   не ошибка — тостим и рефетчим (invalidatesTags на ошибке не срабатывает).
 */
'use client';

import * as React from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Monitor, MonitorSmartphone, Smartphone } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import {
  useGetSessionsQuery,
  useRevokeSessionMutation,
  type AuthSession,
} from '@/store/api/sessionsApi';
import { getApiError } from '@/store/api/apiError';
import { parseUserAgent, deviceLabel } from './sessionDevice';

/** Текущая сессия первой, дальше по свежести активности. */
function sortSessions(sessions: AuthSession[]): AuthSession[] {
  return [...sessions].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    return Date.parse(b.last_rotated_at) - Date.parse(a.last_rotated_at);
  });
}

/** HTTP-статус из ошибки RTK Query (числовой) или null. */
function errorStatus(err: unknown): number | null {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

export function Devices() {
  const t = useTranslations('account');
  const format = useFormatter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const { data, isLoading, refetch } = useGetSessionsQuery(undefined, {
    skip: !isAuthenticated,
  });
  const [revokeSession] = useRevokeSessionMutation();
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  const onRevoke = async (id: string) => {
    if (!window.confirm(t('devices.confirmRevoke'))) return;
    setRevokingId(id);
    try {
      await revokeSession(id).unwrap();
      toast.success(t('devices.revoked'));
    } catch (err) {
      if (errorStatus(err) === 404) {
        // Сессия уже отозвана (напр., с другого устройства) — не ошибка.
        toast.info(t('devices.alreadyRevoked'));
        refetch();
      } else {
        const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
        toast.error(apiErr?.message ?? t('devices.revokeError'));
      }
    } finally {
      setRevokingId(null);
    }
  };

  const header = (
    <div className="mb-[18px]">
      <h1 className="text-[28px]">{t('devices.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('devices.subtitle')}</p>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div>
        {header}
        <EmptyState
          icon={MonitorSmartphone}
          title={t('devices.authTitle')}
          text={t('devices.authText')}
          action={
            <Button asChild>
              {/* Вход — модалка в Header; /login-маршрута нет. */}
              <Link href="/">{t('devices.goHome')}</Link>
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
            <Skeleton key={i} className="h-[92px] rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  const sessions = sortSessions(data ?? []);

  if (sessions.length === 0) {
    return (
      <div>
        {header}
        <EmptyState icon={MonitorSmartphone} title={t('devices.empty')} />
      </div>
    );
  }

  return (
    <div className="max-w-[640px]">
      {header}
      <div className="flex flex-col gap-2.5">
        {sessions.map((s) => {
          const { mobile } = parseUserAgent(s.user_agent);
          const Icon = mobile ? Smartphone : Monitor;
          const label = deviceLabel(s.user_agent) ?? t('devices.unknownDevice');
          return (
            <div
              key={s.id}
              className="flex items-start gap-3.5 rounded-card border border-border/60 bg-surface px-4 py-3.5 shadow-card"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-teal">
                <Icon size={20} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[15px]">{label}</b>
                  {s.is_current && (
                    <Badge variant="new">{t('devices.current')}</Badge>
                  )}
                </div>
                <div className="mt-[3px] text-sm text-muted-foreground">
                  {s.ip && <span>IP {s.ip} · </span>}
                  <span>
                    {t('devices.signedIn')}:{' '}
                    {format.dateTime(new Date(s.created_at), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                  {' · '}
                  <span>
                    {t('devices.lastActive')}:{' '}
                    {format.dateTime(new Date(s.last_rotated_at), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>
              {!s.is_current && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-red hover:text-red-press"
                  disabled={revokingId === s.id}
                  onClick={() => void onRevoke(s.id)}
                >
                  {t('devices.revoke')}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
