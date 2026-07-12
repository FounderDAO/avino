/**
 * Адаптер заявок агентов: API-DTO `AgentApplication` (adminTypes) → UI-row
 * таблицы `/admin/agent-applications`. Паттерн — как `adapters/complaints.ts`:
 * даты форматируем в ru-RU, null-поля деградируют к «—», статус — RU-метка +
 * цвета пилла из дизайн-токенов (globals.css).
 */
import type {
  AgentApplication,
  AgentApplicationStatus,
} from '@/store/api/adminTypes';

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

/** Статус заявки: `[RU-метка, цвет текста, фон]` для пилла. */
export const AGENT_APPLICATION_STATUS_MAP: Record<
  AgentApplicationStatus,
  [label: string, color: string, bg: string]
> = {
  PENDING: ['Ожидает', 'var(--warn)', 'var(--warn-bg)'],
  APPROVED: ['Одобрена', 'var(--green)', 'var(--green-bg)'],
  REJECTED: ['Отклонена', 'var(--muted)', 'var(--archive-bg)'],
};

/** Строка таблицы «Заявки агентов» (под реальную вёрстку). */
export interface AgentApplicationRow {
  id: string;
  /** Полный UUID заявителя — для ссылки на /admin/users/{id}. */
  userId: string;
  userName: string;
  userPhone: string;
  avatarUrl: string | null;
  /** `agency_name` либо «Частный маклер» (заявка без агентства). */
  agency: string;
  about: string;
  status: AgentApplicationStatus;
  rejectReason: string | null;
  created: string;
  resolved: string;
}

export function agentApplicationToRow(a: AgentApplication): AgentApplicationRow {
  return {
    id: a.id,
    userId: a.user.id,
    userName: a.user.name ?? DASH,
    userPhone: a.user.phone ?? DASH,
    avatarUrl: a.user.avatar_url,
    agency: a.agency_name ?? 'Частный маклер',
    about: a.about,
    status: a.status,
    rejectReason: a.reject_reason,
    created: fmtDate(a.created_at),
    resolved: fmtDate(a.resolved_at),
  };
}
