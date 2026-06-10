'use client';

/**
 * Логи (порт Logs из scripts/admin-pages.jsx) — на реальном API (RTK Query).
 * Табы Аудит / Модерация / Промо / Уведомления. Только просмотр. Рендерится
 * один активный таб → один запрос за раз. Вёрстка 1:1 с прототипом; данные —
 * GET /admin/{audit,moderation,promotion,notification}-logs. Фильтры: enum →
 * селект, id/строка → текст с дебаунсом; серверная пагинация; loading/empty/error.
 */
import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { IC } from '@/components/admin/icons';
import { DEFAULT_LIMIT, totalPages } from '@/store/api/adminApi';
import {
  useListAuditLogsQuery,
  useListModerationLogsQuery,
  useListPromotionLogsQuery,
  useListNotificationLogsQuery,
} from '@/store/api/adminLogsApi';
import type {
  ModerationAction,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '@/store/api/adminTypes';
import type { PageMeta } from '@/store/api/pagination';
import {
  auditLogToRow,
  moderationLogToRow,
  promotionLogToRow,
  notificationLogToRow,
  MODERATION_ACTION_OPTIONS,
  NOTIFICATION_TYPE_OPTIONS,
  NOTIFICATION_CHANNEL_OPTIONS,
  NOTIFICATION_STATUS_OPTIONS,
} from '@/lib/adapters/logs';

type TabKey = 'audit' | 'moderation' | 'promo' | 'notifications';

const tabs: [TabKey, string][] = [
  ['audit', 'Аудит'],
  ['moderation', 'Модерация'],
  ['promo', 'Промо'],
  ['notifications', 'Уведомления'],
];

const DEBOUNCE_MS = 400;

/** Дебаунс одного значения (как поиск в эталоне /admin/listings). */
function useDebounced<T>(value: T, ms = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── UI-примитивы (1:1 с прототипом) ─────────────────────────────────────────

function ActionPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className="a-pill"
      style={{ background: ok ? 'var(--green-bg)' : 'var(--red-bg)', color: ok ? 'var(--green)' : 'var(--red)' }}
    >
      {children}
    </span>
  );
}

function Channel({ c }: { c: string }) {
  return (
    <span className="a-pill" style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
      {c}
    </span>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 6,
};

function TextFilter({ label, ph, value, onChange }: { label: string; ph: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <input className="a-field" style={{ width: '100%' }} placeholder={ph} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SelectFilter<T extends string>({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value: T | '';
  options: [T, string][];
  allLabel: string;
  onChange: (v: T | '') => void;
}) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <select className="a-field" style={{ width: '100%' }} value={value} onChange={(e) => onChange(e.target.value as T | '')}>
        <option value="">{allLabel}</option>
        {options.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Состояния таблицы: ошибка/загрузка/пусто. `cols` — colSpan под текущий таб. */
function TableStatus({
  isLoading,
  isError,
  isEmpty,
  cols,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  cols: number;
  onRetry: () => void;
}) {
  if (isError) {
    return (
      <tr>
        <td colSpan={cols} className="muted" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ marginBottom: 12 }}>Не удалось загрузить журнал.</div>
          <button className="abtn abtn-outline" onClick={onRetry}>
            Повторить
          </button>
        </td>
      </tr>
    );
  }
  if (isLoading) {
    return (
      <tr>
        <td colSpan={cols} className="muted" style={{ textAlign: 'center', padding: 40 }}>
          Загрузка…
        </td>
      </tr>
    );
  }
  if (isEmpty) {
    return (
      <tr>
        <td colSpan={cols} className="muted" style={{ textAlign: 'center', padding: 40 }}>
          Записей не найдено по заданным фильтрам.
        </td>
      </tr>
    );
  }
  return null;
}

/** Грид фильтров под текущий таб. */
function FilterGrid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div className="logs-filters" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, marginBottom: 16 }}>
      {children}
    </div>
  );
}

/** Пагинация + «Показано N из total» (как в эталоне /admin/listings). */
function PageBar({ page, setPage, meta, isFetching, shown }: { page: number; setPage: (f: (p: number) => number) => void; meta: PageMeta | undefined; isFetching: boolean; shown: number }) {
  const total = meta?.total ?? 0;
  const pages = totalPages(meta);
  return (
    <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
      <span>{isFetching ? 'Обновление…' : `Показано ${shown} из ${total}`}</span>
      <div className="row gap-4">
        <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          <IC.ChevronLeft size={16} />
        </button>
        <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>
          {page}
        </button>
        <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={pages > 0 && page >= pages} onClick={() => setPage((p) => p + 1)}>
          <IC.ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Таб: Аудит ──────────────────────────────────────────────────────────────

function AuditTab() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorId, setActorId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [page, setPage] = useState(1);

  const dAction = useDebounced(action);
  const dEntityType = useDebounced(entityType);
  const dActorId = useDebounced(actorId);
  const dEntityId = useDebounced(entityId);

  useEffect(() => setPage(1), [dAction, dEntityType, dActorId, dEntityId]);

  const { data, isLoading, isFetching, isError, refetch } = useListAuditLogsQuery({
    action: dAction.trim() || undefined,
    entity_type: dEntityType.trim() || undefined,
    actor_id: dActorId.trim() || undefined,
    entity_id: dEntityId.trim() || undefined,
    page,
    limit: DEFAULT_LIMIT,
  });

  const rows = (data?.data ?? []).map(auditLogToRow);

  return (
    <>
      <FilterGrid cols={4}>
        <TextFilter label="Действие" ph="ROLE_CHANGE, LISTING_STATUS_CHANGE…" value={action} onChange={setAction} />
        <TextFilter label="Тип сущности" ph="user, listing…" value={entityType} onChange={setEntityType} />
        <TextFilter label="ID актора" ph="UUID" value={actorId} onChange={setActorId} />
        <TextFilter label="ID сущности" ph="UUID" value={entityId} onChange={setEntityId} />
      </FilterGrid>
      <div className="a-card table-scroll">
        <table className="a-table">
          <thead>
            <tr>
              <th>Действие</th>
              <th>Сущность</th>
              <th>Актор</th>
              <th>IP</th>
              <th style={{ textAlign: 'right' }}>Когда</th>
            </tr>
          </thead>
          <tbody>
            <TableStatus isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} cols={5} onRetry={refetch} />
            {!isLoading &&
              !isError &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="log-tag">{r.action}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.entityType}</div>
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {r.entityId}
                    </div>
                  </td>
                  <td className="muted mono" style={{ whiteSpace: 'nowrap' }}>
                    {r.actor}
                  </td>
                  <td className="muted mono">{r.ip}</td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.when}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <PageBar page={page} setPage={setPage} meta={data?.meta} isFetching={isFetching} shown={rows.length} />
    </>
  );
}

// ─── Таб: Модерация ──────────────────────────────────────────────────────────

function ModerationTab() {
  const [listingId, setListingId] = useState('');
  const [moderatorId, setModeratorId] = useState('');
  const [action, setAction] = useState<ModerationAction | ''>('');
  const [page, setPage] = useState(1);

  const dListingId = useDebounced(listingId);
  const dModeratorId = useDebounced(moderatorId);

  useEffect(() => setPage(1), [dListingId, dModeratorId, action]);

  const { data, isLoading, isFetching, isError, refetch } = useListModerationLogsQuery({
    listing_id: dListingId.trim() || undefined,
    moderator_id: dModeratorId.trim() || undefined,
    action: action || undefined,
    page,
    limit: DEFAULT_LIMIT,
  });

  const rows = (data?.data ?? []).map(moderationLogToRow);

  return (
    <>
      <FilterGrid cols={3}>
        <TextFilter label="Объявление" ph="ID объявления" value={listingId} onChange={setListingId} />
        <TextFilter label="Модератор" ph="ID модератора" value={moderatorId} onChange={setModeratorId} />
        <SelectFilter label="Действие" value={action} options={MODERATION_ACTION_OPTIONS} allLabel="Все действия" onChange={setAction} />
      </FilterGrid>
      <div className="a-card table-scroll">
        <table className="a-table">
          <thead>
            <tr>
              <th>Действие</th>
              <th>Объявление</th>
              <th>Модератор</th>
              <th>Причина</th>
              <th style={{ textAlign: 'right' }}>Когда</th>
            </tr>
          </thead>
          <tbody>
            <TableStatus isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} cols={5} onRetry={refetch} />
            {!isLoading &&
              !isError &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <ActionPill ok={r.ok}>{r.actionLabel}</ActionPill>
                  </td>
                  <td style={{ fontWeight: 600, maxWidth: 260 }}>
                    <div className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.listing}
                    </div>
                  </td>
                  <td className="muted mono">{r.moderator}</td>
                  <td className="muted">{r.reason}</td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.when}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <PageBar page={page} setPage={setPage} meta={data?.meta} isFetching={isFetching} shown={rows.length} />
    </>
  );
}

// ─── Таб: Промо ──────────────────────────────────────────────────────────────

function PromoTab() {
  const [listingId, setListingId] = useState('');
  const [adminId, setAdminId] = useState('');
  const [page, setPage] = useState(1);

  const dListingId = useDebounced(listingId);
  const dAdminId = useDebounced(adminId);

  useEffect(() => setPage(1), [dListingId, dAdminId]);

  const { data, isLoading, isFetching, isError, refetch } = useListPromotionLogsQuery({
    listing_id: dListingId.trim() || undefined,
    admin_id: dAdminId.trim() || undefined,
    page,
    limit: DEFAULT_LIMIT,
  });

  const rows = (data?.data ?? []).map(promotionLogToRow);

  return (
    <>
      <FilterGrid cols={2}>
        <TextFilter label="Объявление" ph="ID объявления" value={listingId} onChange={setListingId} />
        <TextFilter label="Администратор" ph="ID администратора" value={adminId} onChange={setAdminId} />
      </FilterGrid>
      <div className="a-card table-scroll">
        <table className="a-table">
          <thead>
            <tr>
              <th>Действие</th>
              <th>Объявление</th>
              <th>Переход</th>
              <th>Администратор</th>
              <th style={{ textAlign: 'right' }}>Когда</th>
            </tr>
          </thead>
          <tbody>
            <TableStatus isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} cols={5} onRetry={refetch} />
            {!isLoading &&
              !isError &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span
                      className="a-pill"
                      style={{ background: r.isVip ? 'var(--gold-bg)' : 'var(--red-bg)', color: r.isVip ? 'var(--gold)' : 'var(--red)' }}
                    >
                      {r.actionLabel}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, maxWidth: 240 }}>
                    <div className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.listing}
                    </div>
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {r.transition}
                  </td>
                  <td className="muted mono">{r.buyer}</td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.when}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <PageBar page={page} setPage={setPage} meta={data?.meta} isFetching={isFetching} shown={rows.length} />
    </>
  );
}

// ─── Таб: Уведомления ────────────────────────────────────────────────────────

function NotificationsTab() {
  const [userId, setUserId] = useState('');
  const [type, setType] = useState<NotificationType | ''>('');
  const [channel, setChannel] = useState<NotificationChannel | ''>('');
  const [status, setStatus] = useState<NotificationStatus | ''>('');
  const [page, setPage] = useState(1);

  const dUserId = useDebounced(userId);

  useEffect(() => setPage(1), [dUserId, type, channel, status]);

  const { data, isLoading, isFetching, isError, refetch } = useListNotificationLogsQuery({
    user_id: dUserId.trim() || undefined,
    type: type || undefined,
    channel: channel || undefined,
    status: status || undefined,
    page,
    limit: DEFAULT_LIMIT,
  });

  const rows = (data?.data ?? []).map(notificationLogToRow);

  return (
    <>
      <FilterGrid cols={4}>
        <TextFilter label="Получатель" ph="ID пользователя" value={userId} onChange={setUserId} />
        <SelectFilter label="Тип" value={type} options={NOTIFICATION_TYPE_OPTIONS} allLabel="Все типы" onChange={setType} />
        <SelectFilter label="Канал" value={channel} options={NOTIFICATION_CHANNEL_OPTIONS} allLabel="Все каналы" onChange={setChannel} />
        <SelectFilter label="Статус" value={status} options={NOTIFICATION_STATUS_OPTIONS} allLabel="Все статусы" onChange={setStatus} />
      </FilterGrid>
      <div className="a-card table-scroll">
        <table className="a-table">
          <thead>
            <tr>
              <th>Тип</th>
              <th>Получатель</th>
              <th>Канал</th>
              <th>Статус</th>
              <th style={{ textAlign: 'right' }}>Когда</th>
            </tr>
          </thead>
          <tbody>
            <TableStatus isLoading={isLoading} isError={isError} isEmpty={rows.length === 0} cols={5} onRetry={refetch} />
            {!isLoading &&
              !isError &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.typeLabel}</div>
                    {r.title !== '—' && (
                      <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                        {r.title}
                      </div>
                    )}
                  </td>
                  <td className="muted mono" style={{ whiteSpace: 'nowrap' }}>
                    {r.recipient}
                  </td>
                  <td>
                    <Channel c={r.channelLabel} />
                  </td>
                  <td>
                    <ActionPill ok={r.ok}>{r.statusLabel}</ActionPill>
                  </td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.when}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <PageBar page={page} setPage={setPage} meta={data?.meta} isFetching={isFetching} shown={rows.length} />
    </>
  );
}

export default function LogsPage() {
  const [tab, setTab] = useState<TabKey>('audit');

  return (
    <div>
      <SectionTitle sub="Журналы аудита, модерации, промо и уведомлений. Только просмотр.">Логи</SectionTitle>
      <div className="row" style={{ gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 14px',
              marginBottom: -1,
              fontSize: 14.5,
              fontWeight: 700,
              color: tab === k ? 'var(--ink)' : 'var(--muted)',
              borderBottom: tab === k ? '2.5px solid var(--red)' : '2.5px solid transparent',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Рендерим только активный таб → один запрос за раз. */}
      {tab === 'audit' && <AuditTab />}
      {tab === 'moderation' && <ModerationTab />}
      {tab === 'promo' && <PromoTab />}
      {tab === 'notifications' && <NotificationsTab />}
    </div>
  );
}
