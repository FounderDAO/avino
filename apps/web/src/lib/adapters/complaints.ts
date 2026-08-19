/**
 * Адаптер жалоб: API-DTO `Complaint` (adminTypes) → UI-row таблицы
 * `/admin/complaints`. Паттерн — как в `adapters/logs.ts`: даты форматируем,
 * UUID показываем усечённо (полный `listingId` сохраняется для ссылки на
 * карточку объявления), статус — RU-метка + цвета пилла из дизайн-токенов.
 */
import type { Complaint, ComplaintStatus } from '@/store/api/adminTypes';

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

/** Статус жалобы: `[RU-метка, цвет текста, фон]` для пилла (токены globals.css). */
export const COMPLAINT_STATUS_MAP: Record<
  ComplaintStatus,
  [label: string, color: string, bg: string]
> = {
  NEW: ['Новая', 'var(--warn)', 'var(--warn-bg)'],
  IN_REVIEW: ['В работе', 'var(--teal)', 'var(--mint)'],
  RESOLVED: ['Решена', 'var(--green)', 'var(--green-bg)'],
  REJECTED: ['Отклонена', 'var(--muted)', 'var(--archive-bg)'],
};

/** Строка таблицы «Жалобы» (под реальную вёрстку). */
export interface ComplaintRow {
  id: string;
  reason: string;
  details: string | null;
  status: ComplaintStatus;
  /** Полный UUID листинга — для ссылки на /admin/listings/{id}. */
  listingId: string;
  listingShort: string;
  /** Полный UUID заявителя — для ссылки на /admin/users/{id} (null у легаси-жалоб). */
  reporterId: string | null;
  reporter: string;
  handledBy: string;
  created: string;
  handled: string;
}

/** Русские подписи reason-кодов жалоб (контракт API — docs/MOBILE_API_CHANGES.md §4.4).
 *  Легаси-жалобы со свободным reason показываются как есть. */
export const COMPLAINT_REASON_LABELS: Record<string, string> = {
  SPAM: 'Спам',
  FRAUD: 'Мошенничество',
  WRONG_INFO: 'Неверная информация',
  OFFENSIVE: 'Оскорбительный контент',
  ALREADY_SOLD: 'Уже продано или сдано',
  OTHER: 'Другое',
};

export function complaintReasonLabel(raw: string): string {
  return COMPLAINT_REASON_LABELS[raw] ?? raw;
}

export function complaintToRow(c: Complaint): ComplaintRow {
  return {
    id: c.id,
    reason: c.reason,
    details: c.details,
    status: c.status,
    listingId: c.listing_id,
    listingShort: shortId(c.listing_id),
    reporterId: c.user_id,
    reporter: shortId(c.user_id),
    handledBy: shortId(c.handled_by),
    created: fmtDate(c.created_at),
    handled: fmtDate(c.handled_at),
  };
}
