/**
 * Адаптеры логов: API-DTO (`adminTypes`) → UI-row типы для таблиц страницы
 * `/admin/logs`. Цикл 3: вёрстка остаётся, источник — RTK Query.
 *
 * Мок-типы логов (`@/lib/mock`) узкие и не совпадают с API: у модерации 4
 * действия (APPROVE/SEND_TO_DRAFT/REJECT/DELETE) против 2 в моке; статусы
 * уведомлений PENDING/SENT/FAILED/READ против sent/failed; в API только
 * id-поля (actor_id/moderator_id/admin_id/user_id/listing_id), а не имена.
 * Поэтому здесь объявлены собственные UI-row типы под то, что реально рендерит
 * таблица, и адаптеры к ним. Идентификаторы показываем усечённо (или «—», если
 * null); даты форматируем; enum — человекочитаемые RU-метки (перенесены из
 * `apps/web_old/src/lib/i18n/enums.ts`).
 */
import type {
  AuditLog,
  ListingStatus,
  ModerationAction,
  ModerationLog,
  NotificationChannel,
  NotificationLog,
  NotificationStatus,
  NotificationType,
  OtpChannel,
  OtpLog,
  OtpLogStatus,
  OtpPurpose,
  PromotionAdminAction,
  PromotionLog,
  PromotionType,
} from '@/store/api/adminTypes';

const DASH = '—';

// ─── Форматирование ──────────────────────────────────────────────────────────

const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** ISO → «дд.мм.гггг чч:мм» (или «—» при null/невалидной дате). */
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

// ─── RU-метки enum'ов (перенос из web_old i18n) ──────────────────────────────

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  NEW: 'На модерации',
  ACTIVE: 'Активно',
  DRAFT: 'Черновик',
  REJECTED: 'Отклонено',
  DELETED: 'Удалено',
  ARCHIVED: 'В архиве',
  SOLD: 'Продано',
  RENTED: 'Сдано',
};

export const MODERATION_ACTION_LABEL: Record<ModerationAction, string> = {
  APPROVE: 'Одобрить',
  SEND_TO_DRAFT: 'В черновик',
  REJECT: 'Отклонить',
  DELETE: 'Удалить',
  OWNER_EDIT: 'Правка владельца',
};

export const PROMOTION_TYPE_LABEL: Record<PromotionType, string> = {
  NORMAL: 'Без промо',
  TOP: 'TOP',
  VIP: 'VIP',
};

export const PROMOTION_ADMIN_ACTION_LABEL: Record<PromotionAdminAction, string> =
  {
    ACTIVATE_VIP: 'Активация VIP',
    ACTIVATE_TOP: 'Активация TOP',
    CANCEL_PROMOTION: 'Отмена промо',
    EXTEND_PROMOTION: 'Продление промо',
  };

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  SAVED_SEARCH_NEW_LISTING: 'Новое по сохранённому поиску',
  FAVORITE_PRICE_DROP: 'Снижение цены в избранном',
  NEW_CHAT_MESSAGE: 'Новое сообщение в чате',
  LISTING_MODERATION_STATUS_CHANGED: 'Смена статуса модерации',
  NEW_LEAD: 'Новый лид',
  PROMOTION_ACTIVATED: 'Промо активировано',
  PROMOTION_EXPIRED: 'Промо истекло',
};

export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = {
  EMAIL: 'Email',
  PUSH: 'Push',
  IN_APP: 'В приложении',
};

export const NOTIFICATION_STATUS_LABEL: Record<NotificationStatus, string> = {
  PENDING: 'В очереди',
  SENT: 'Отправлено',
  FAILED: 'Ошибка',
  READ: 'Прочитано',
};

/** Опции enum-селекта `[значение, метка]`, для всех ключей словаря меток. */
function toSelectOptions<K extends string>(
  labels: Record<K, string>,
): [K, string][] {
  return (Object.keys(labels) as K[]).map((k) => [k, labels[k]]);
}

export const MODERATION_ACTION_OPTIONS = toSelectOptions(
  MODERATION_ACTION_LABEL,
);
export const PROMOTION_ADMIN_ACTION_OPTIONS = toSelectOptions(
  PROMOTION_ADMIN_ACTION_LABEL,
);
export const NOTIFICATION_TYPE_OPTIONS = toSelectOptions(
  NOTIFICATION_TYPE_LABEL,
);
export const NOTIFICATION_CHANNEL_OPTIONS = toSelectOptions(
  NOTIFICATION_CHANNEL_LABEL,
);
export const NOTIFICATION_STATUS_OPTIONS = toSelectOptions(
  NOTIFICATION_STATUS_LABEL,
);

// ─── UI-row типы (под реальную вёрстку таблиц) ───────────────────────────────

/** Строка таблицы «Аудит». `action`/`entityType`/`actor`/`ip` — free-form/usable as-is. */
export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  ip: string;
  when: string;
}

/** Строка таблицы «Модерация». `actionLabel` — RU-метка; `ok` — для цветного пилла. */
export interface ModerationLogRow {
  id: string;
  action: ModerationAction;
  actionLabel: string;
  ok: boolean;
  listing: string;
  moderator: string;
  reason: string;
  when: string;
}

/** Строка таблицы «Промо». `typeLabel` — RU-метка типа промо; переход тира old→new. */
export interface PromotionLogRow {
  id: string;
  actionLabel: string;
  isVip: boolean;
  listing: string;
  transition: string;
  buyer: string;
  when: string;
}

/** Строка таблицы «Уведомления». `ok` — доставлено (SENT/READ); иначе ошибка/в очереди. */
export interface NotificationLogRow {
  id: string;
  typeLabel: string;
  title: string;
  recipient: string;
  channelLabel: string;
  statusLabel: string;
  ok: boolean;
  when: string;
}

// ─── Адаптеры DTO → row ──────────────────────────────────────────────────────

/** Переход enum-значений «A → B» с RU-метками и прочерком для null. */
function transition<T extends string>(
  oldVal: T | null,
  newVal: T | null,
  labels: Record<T, string>,
): string {
  const fmt = (v: T | null) => (v ? labels[v] : DASH);
  return `${fmt(oldVal)} → ${fmt(newVal)}`;
}

export function auditLogToRow(r: AuditLog): AuditLogRow {
  return {
    id: r.id,
    action: r.action,
    entityType: r.entity_type ?? DASH,
    entityId: r.entity_id ? shortId(r.entity_id) : DASH,
    actor: r.actor_id ? shortId(r.actor_id) : 'Система',
    ip: r.ip ?? DASH,
    when: fmtDate(r.created_at),
  };
}

export function moderationLogToRow(r: ModerationLog): ModerationLogRow {
  return {
    id: r.id,
    action: r.action,
    actionLabel: MODERATION_ACTION_LABEL[r.action],
    ok: r.action === 'APPROVE',
    listing: shortId(r.listing_id),
    moderator: r.moderator_id ? shortId(r.moderator_id) : DASH,
    reason: r.reason ?? DASH,
    when: fmtDate(r.created_at),
  };
}

export function promotionLogToRow(r: PromotionLog): PromotionLogRow {
  return {
    id: r.id,
    actionLabel: PROMOTION_ADMIN_ACTION_LABEL[r.action],
    isVip: r.new_type === 'VIP' || r.action === 'ACTIVATE_VIP',
    listing: shortId(r.listing_id),
    transition: transition(r.old_type, r.new_type, PROMOTION_TYPE_LABEL),
    buyer: r.admin_id ? shortId(r.admin_id) : DASH,
    when: fmtDate(r.created_at),
  };
}

export function notificationLogToRow(r: NotificationLog): NotificationLogRow {
  return {
    id: r.id,
    typeLabel: NOTIFICATION_TYPE_LABEL[r.type],
    title: r.title ?? DASH,
    recipient: shortId(r.user_id),
    channelLabel: NOTIFICATION_CHANNEL_LABEL[r.channel],
    statusLabel: NOTIFICATION_STATUS_LABEL[r.status],
    ok: r.status === 'SENT' || r.status === 'READ',
    when: fmtDate(r.sent_at ?? r.created_at),
  };
}

// ─── OTP-журнал ──────────────────────────────────────────────────────────────

export const OTP_CHANNEL_LABEL: Record<OtpChannel, string> = {
  SMS: 'SMS',
  EMAIL: 'Email',
};

export const OTP_PURPOSE_LABEL: Record<OtpPurpose, string> = {
  LOGIN: 'Вход',
  CONTACT_CHANGE: 'Смена контакта',
};

/** «Погашен» — использован или заменён новым кодом (consumed_at единый). */
export const OTP_STATUS_LABEL: Record<OtpLogStatus, string> = {
  ACTIVE: 'Активен',
  CONSUMED: 'Погашен',
  EXPIRED: 'Истёк',
};

export interface OtpLogRow {
  id: string;
  destination: string;
  channelLabel: string;
  purposeLabel: string;
  status: OtpLogStatus;
  statusLabel: string;
  attempts: number;
  user: string;
  when: string;
}

export function otpLogToRow(log: OtpLog): OtpLogRow {
  return {
    id: log.id,
    destination: log.destination,
    channelLabel: OTP_CHANNEL_LABEL[log.channel] ?? log.channel,
    purposeLabel: OTP_PURPOSE_LABEL[log.purpose] ?? log.purpose,
    status: log.status,
    statusLabel: OTP_STATUS_LABEL[log.status] ?? log.status,
    attempts: log.attempts,
    user: log.user_name ?? shortId(log.user_id),
    when: fmtDate(log.created_at),
  };
}
