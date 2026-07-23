/**
 * Адаптер обращений поддержки: API-DTO `SupportRequest` → UI-row таблицы
 * `/admin/support`. Даты форматируем, UUID усечённо, статус — RU-метка +
 * цвета пилла из дизайн-токенов (как adapters/complaints.ts).
 */
import type { SupportRequest, SupportRequestStatus } from '@/store/api/adminTypes';

const DASH = '—';

const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** ISO → «дд.мм.гггг, чч:мм» (или «—» при null/невалидной дате). */
function fmtDate(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : dateTimeFmt.format(d);
}

/** UUID → короткая форма (первые 8 символов) для компактного отображения. */
function shortId(id: string | null): string {
  if (!id) return DASH;
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Статус обращения: `[RU-метка, цвет текста, фон]` для пилла (токены globals.css). */
export const SUPPORT_STATUS_MAP: Record<
  SupportRequestStatus,
  [label: string, color: string, bg: string]
> = {
  NEW: ['Новое', 'var(--warn)', 'var(--warn-bg)'],
  IN_REVIEW: ['В работе', 'var(--teal)', 'var(--mint)'],
  RESOLVED: ['Решено', 'var(--green)', 'var(--green-bg)'],
};

/** Строка таблицы «Обращения» (под реальную вёрстку). */
export interface SupportRow {
  id: string;
  author: string;
  contact: string;
  message: string;
  status: SupportRequestStatus;
  handledBy: string;
  created: string;
  handled: string;
}

export function supportRequestToRow(r: SupportRequest): SupportRow {
  return {
    id: r.id,
    author: r.name || (r.user_id ? shortId(r.user_id) : 'Гость'),
    contact: r.contact,
    message: r.message,
    status: r.status,
    handledBy: shortId(r.handled_by),
    created: fmtDate(r.created_at),
    handled: fmtDate(r.handled_at),
  };
}
