/**
 * Статус-pill (.a-pill). StatusPill — для статуса объявления (через STATUS_MAP).
 * Pill — обобщённый бейдж с произвольными цветами.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import { ADMIN } from '@/lib/mock';
import type { AdminListingStatus } from '@/lib/mock';

interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  bg?: string;
  color?: string;
}

export function Pill({ bg, color, className, style, children, ...props }: PillProps) {
  return (
    <span className={cn('a-pill', className)} style={{ background: bg, color, ...style }} {...props}>
      {children}
    </span>
  );
}

/** Статус объявления (Опубликовано / На проверке / Отклонено / Черновик / В архиве). */
export function StatusPill({ status }: { status: AdminListingStatus }) {
  const [label, color, bg] = ADMIN.STATUS_MAP[status] ?? ADMIN.STATUS_MAP.ACTIVE;
  return <Pill bg={bg} color={color}>{label}</Pill>;
}

/** Статус пользователя (Активен / Заблокирован / Удалён). */
export function UserStatusPill({ status }: { status: 'active' | 'blocked' | 'deleted' }) {
  if (status === 'deleted') {
    // Soft-delete — отдельный нейтральный бейдж (не «Заблокирован»).
    return <Pill bg="#eceff1" color="#78909c">Удалён</Pill>;
  }
  const ok = status === 'active';
  return (
    <Pill bg={ok ? 'var(--green-bg)' : 'var(--red-bg)'} color={ok ? 'var(--green)' : 'var(--red)'}>
      {ok ? 'Активен' : 'Заблокирован'}
    </Pill>
  );
}

/** Способ последнего входа: цвет+метка по провайдеру/каналу. */
const AUTH_TYPE_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  GOOGLE: { label: 'Google', bg: '#e8f0fe', color: '#1a73e8' },
  APPLE: { label: 'Apple', bg: '#f1f3f4', color: '#202124' },
  SMS: { label: 'SMS', bg: 'var(--green-bg)', color: 'var(--green)' },
  EMAIL: { label: 'Email', bg: '#fff3e0', color: '#e67700' },
};

/** Бейдж способа входа (Google / Apple / SMS / Email); `null` → «—». */
export function AuthTypePill({ authType }: { authType: string | null }) {
  const s = authType ? AUTH_TYPE_STYLE[authType] : undefined;
  if (!s) return <span className="muted">—</span>;
  return <Pill bg={s.bg} color={s.color}>{s.label}</Pill>;
}
