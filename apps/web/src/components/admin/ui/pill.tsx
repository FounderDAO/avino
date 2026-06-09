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

/** Статус пользователя (Активен / Заблокирован). */
export function UserStatusPill({ status }: { status: 'active' | 'blocked' }) {
  const ok = status === 'active';
  return (
    <Pill bg={ok ? 'var(--green-bg)' : 'var(--red-bg)'} color={ok ? 'var(--green)' : 'var(--red)'}>
      {ok ? 'Активен' : 'Заблокирован'}
    </Pill>
  );
}
