/**
 * Адаптер журнала согласий: API-DTO (`LegalConsent`) → UI-row для таблицы
 * `/admin/legal-consents`. Дата принятия — «дд.мм.гггг чч:мм» (ru-RU); дата
 * введения версии (справочная панель / пилюля) — «дд.мм.гггг».
 */
import type { LegalConsent } from '@/store/api/adminTypes';

const DASH = '—';

const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** ISO → «дд.мм.гггг чч:мм» (или «—» при null/невалидной дате). */
function fmtDateTime(iso: string | null): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : dateTimeFmt.format(d);
}

/** ISO → «дд.мм.гггг» (или «базовая» при null — версия без даты введения). */
export function fmtVersionDate(iso: string | null): string {
  if (!iso) return 'базовая';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'базовая' : dateFmt.format(d);
}

export interface LegalConsentRow {
  id: string;
  user: string;
  contact: string;
  version: number;
  when: string;
}

export function legalConsentToRow(dto: LegalConsent): LegalConsentRow {
  return {
    id: dto.id,
    user: dto.user_name ?? DASH,
    contact: dto.user_contact ?? DASH,
    version: dto.version,
    when: fmtDateTime(dto.accepted_at),
  };
}
