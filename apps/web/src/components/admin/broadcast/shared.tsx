/**
 * Общие презентационные примитивы для страниц рассылок (ADR-0103).
 *
 * Лейбл-карты, константы-массивы и компоненты StatusBadge / ChannelIcons.
 * Не содержит хуков — server-safe, импортируется из любой страницы.
 *
 * Цветовые переменные совпадают с остальными бейджами админки
 * (см. apps/web/src/lib/mock/admin.ts STATUS_MAP):
 *   --green/--green-bg, --warn/--warn-bg, --red/--red-bg, --teal/--mint, --muted/--archive-bg
 */
import * as React from 'react';

import type {
  BroadcastStatusValue,
  BroadcastChannelValue,
  BroadcastLanguageValue,
  BroadcastAudienceValue,
  BroadcastUserStatusValue,
} from '@/store/api/adminBroadcastsApi';
import { IC } from '../icons';

// ─── лейбл-карты (русские) ───────────────────────────────────────────────────

export const statusLabels: Record<BroadcastStatusValue, string> = {
  SCHEDULED: 'Запланирована',
  SENDING: 'Отправляется',
  SENT: 'Отправлена',
  FAILED: 'Ошибка',
  CANCELED: 'Отменена',
};

export const channelLabels: Record<BroadcastChannelValue, string> = {
  IN_APP: 'В приложении',
  EMAIL: 'Email',
  PUSH: 'Push',
  SMS: 'SMS',
};

export const languageLabels: Record<BroadcastLanguageValue, string> = {
  UZ: "O'zbek",
  RU: 'Русский',
  EN: 'English',
};

export const audienceLabels: Record<BroadcastAudienceValue, string> = {
  SINGLE: 'Один пользователь',
  SEGMENT: 'Сегмент',
};

export const userStatusLabels: Record<BroadcastUserStatusValue, string> = {
  ACTIVE: 'Активные',
  BLOCKED: 'Заблокированные',
  DELETED: 'Удалённые',
};

export const roleLabels: Record<string, string> = {
  USER: 'Пользователь',
  OWNER: 'Собственник',
  AGENT: 'Агент',
  AGENCY: 'Агентство',
  LANDLORD: 'Арендодатель',
  PROPERTY_MANAGER: 'Управляющий',
  MODERATOR: 'Модератор',
  ADMIN: 'Администратор',
};

// ─── константы-массивы для селекторов формы ─────────────────────────────────

export const BROADCAST_CHANNELS: BroadcastChannelValue[] = [
  'IN_APP',
  'EMAIL',
  'PUSH',
  'SMS',
];

export const BROADCAST_LANGUAGES: BroadcastLanguageValue[] = ['RU', 'UZ', 'EN'];

export const BROADCAST_USER_STATUSES: BroadcastUserStatusValue[] = [
  'ACTIVE',
  'BLOCKED',
  'DELETED',
];

export const BROADCAST_ROLES: string[] = [
  'USER',
  'OWNER',
  'AGENT',
  'AGENCY',
  'LANDLORD',
  'PROPERTY_MANAGER',
  'MODERATOR',
  'ADMIN',
];

export const SMS_TEMPLATE_HINT =
  'SMS отправится как фиксированный шаблон-уведомление («У вас новое сообщение от Avino, откройте приложение»), а не текст из поля ниже.';

// ─── цвета бейджей статуса (совпадают с COLOR-палитрой админки) ─────────────

const STATUS_COLORS: Record<BroadcastStatusValue, { color: string; bg: string }> = {
  SCHEDULED: { color: 'var(--teal)', bg: 'var(--mint)' },
  SENDING: { color: 'var(--warn)', bg: 'var(--warn-bg)' },
  SENT: { color: 'var(--green)', bg: 'var(--green-bg)' },
  FAILED: { color: 'var(--red)', bg: 'var(--red-bg)' },
  CANCELED: { color: 'var(--muted)', bg: 'var(--archive-bg)' },
};

// ─── компоненты ──────────────────────────────────────────────────────────────

/** Бейдж статуса рассылки. Использует те же CSS-переменные, что и StatusPill. */
export function StatusBadge({ status }: { status: BroadcastStatusValue }) {
  const { color, bg } = STATUS_COLORS[status];
  return (
    <span className="a-pill" style={{ color, background: bg }}>
      {statusLabels[status]}
    </span>
  );
}

/** Маппинг канала → иконка (lucide-react через IC). */
const CHANNEL_ICONS: Record<BroadcastChannelValue, React.ElementType> = {
  IN_APP: IC.Bell,
  EMAIL: IC.Mail,
  PUSH: IC.Send,
  SMS: IC.MessageSquare,
};

/** Ряд иконок каналов с title-подсказкой (доступность). */
export function ChannelIcons({
  channels,
  size = 16,
}: {
  channels: BroadcastChannelValue[];
  size?: number;
}) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {channels.map((ch) => {
        const Icon = CHANNEL_ICONS[ch];
        return (
          <Icon
            key={ch}
            size={size}
            strokeWidth={1.9}
            title={channelLabels[ch]}
            style={{ color: 'var(--muted)' }}
          />
        );
      })}
    </span>
  );
}
