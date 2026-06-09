'use client';

/**
 * Логи (порт Logs из scripts/admin-pages.jsx).
 * Табы Аудит / Модерация / Промо / Уведомления с фильтрами. Только просмотр. 1:1 с прототипом.
 */
import { useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { ADMIN } from '@/lib/mock';
import type { AuditLog, ModerationLog, PromoLog, NotificationLog } from '@/lib/mock';

type TabKey = 'audit' | 'moderation' | 'promo' | 'notifications';

interface FieldCfg<T> {
  k: string;
  l: string;
  ph: string;
  f: (r: T) => string;
}

const tabs: [TabKey, string][] = [
  ['audit', 'Аудит'],
  ['moderation', 'Модерация'],
  ['promo', 'Промо'],
  ['notifications', 'Уведомления'],
];

const cfgAudit: FieldCfg<AuditLog>[] = [
  { k: 'action', l: 'Действие', ph: 'ROLE_CHANGE, LISTING_STATUS_CHANGE…', f: (r) => r.action },
  { k: 'entity', l: 'Тип сущности', ph: 'user, listing…', f: (r) => r.entity },
  { k: 'actor', l: 'ID актора', ph: 'UUID', f: (r) => r.actor },
  { k: 'entityId', l: 'ID сущности', ph: 'UUID', f: (r) => r.entityId },
];

const cfgModeration: FieldCfg<ModerationLog>[] = [
  { k: 'action', l: 'Действие', ph: 'APPROVE / REJECT', f: (r) => r.action },
  { k: 'listing', l: 'Объявление', ph: 'название…', f: (r) => r.listing },
  { k: 'moderator', l: 'Модератор', ph: 'ID', f: (r) => r.moderator },
];

const cfgPromo: FieldCfg<PromoLog>[] = [
  { k: 'type', l: 'Тип', ph: 'TOP / VIP', f: (r) => r.type },
  { k: 'buyer', l: 'Покупатель', ph: 'имя…', f: (r) => r.buyer },
  { k: 'listing', l: 'Объявление', ph: 'название…', f: (r) => r.listing },
];

const cfgNotifications: FieldCfg<NotificationLog>[] = [
  { k: 'type', l: 'Тип', ph: 'NEW_MESSAGE…', f: (r) => r.type },
  { k: 'recipient', l: 'Получатель', ph: 'имя…', f: (r) => r.recipient },
  { k: 'channel', l: 'Канал', ph: 'SMS / email / push', f: (r) => r.channel },
  { k: 'status', l: 'Статус', ph: 'sent / failed', f: (r) => r.status },
];

/** Длина колонок текущего таба — для grid фильтров. */
const cfgLen: Record<TabKey, number> = {
  audit: cfgAudit.length,
  moderation: cfgModeration.length,
  promo: cfgPromo.length,
  notifications: cfgNotifications.length,
};

/** Generic-фильтр строк по конфигу полей и значениям фильтров. */
function filterRows<T>(list: T[], cfg: FieldCfg<T>[], filters: Record<string, string>): T[] {
  return list.filter((r) =>
    cfg.every((c) => !filters[c.k] || String(c.f(r)).toLowerCase().includes(filters[c.k].toLowerCase())),
  );
}

const fmt = (n: number): string => Number(n).toLocaleString('ru-RU') + ' сум';

function ActionPill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="a-pill" style={{ background: ok ? 'var(--green-bg)' : 'var(--red-bg)', color: ok ? 'var(--green)' : 'var(--red)' }}>
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

export default function LogsPage() {
  const [tab, setTab] = useState<TabKey>('audit');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const setF = (k: string, v: string) => setFilters((p) => ({ ...p, [k]: v }));
  const changeTab = (t: TabKey) => {
    setTab(t);
    setFilters({});
  };

  const auditRows = filterRows(ADMIN.logs.audit, cfgAudit, filters);
  const moderationRows = filterRows(ADMIN.logs.moderation, cfgModeration, filters);
  const promoRows = filterRows(ADMIN.logs.promo, cfgPromo, filters);
  const notificationRows = filterRows(ADMIN.logs.notifications, cfgNotifications, filters);

  const rowCount: Record<TabKey, number> = {
    audit: auditRows.length,
    moderation: moderationRows.length,
    promo: promoRows.length,
    notifications: notificationRows.length,
  };
  const count = rowCount[tab];

  const cfg: FieldCfg<unknown>[] =
    tab === 'audit'
      ? (cfgAudit as FieldCfg<unknown>[])
      : tab === 'moderation'
        ? (cfgModeration as FieldCfg<unknown>[])
        : tab === 'promo'
          ? (cfgPromo as FieldCfg<unknown>[])
          : (cfgNotifications as FieldCfg<unknown>[]);

  return (
    <div>
      <SectionTitle sub="Журналы аудита, модерации, промо и уведомлений. Только просмотр.">Логи</SectionTitle>
      <div className="row" style={{ gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => changeTab(k)}
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
      <div className="logs-filters" style={{ display: 'grid', gridTemplateColumns: `repeat(${cfgLen[tab]}, 1fr)`, gap: 14, marginBottom: 16 }}>
        {cfg.map((c) => (
          <div key={c.k}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>{c.l}</label>
            <input className="a-field" style={{ width: '100%' }} placeholder={c.ph} value={filters[c.k] || ''} onChange={(e) => setF(c.k, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="a-card table-scroll">
        <table className="a-table">
          {tab === 'audit' && (
            <>
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
                {auditRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="log-tag">{r.action}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.entity}</div>
                      <div className="muted mono" style={{ fontSize: 12 }}>{r.entityId}</div>
                    </td>
                    <td className="muted mono" style={{ whiteSpace: 'nowrap' }}>{r.actor}</td>
                    <td className="muted mono">{r.ip}</td>
                    <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.when}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
          {tab === 'moderation' && (
            <>
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
                {moderationRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <ActionPill ok={r.action === 'APPROVE'}>{r.action === 'APPROVE' ? 'Одобрено' : 'Отклонено'}</ActionPill>
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 260 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.listing}</div>
                    </td>
                    <td className="muted mono">{r.moderator}</td>
                    <td className="muted">{r.reason}</td>
                    <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.when}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
          {tab === 'promo' && (
            <>
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Объявление</th>
                  <th>Покупатель</th>
                  <th>Срок</th>
                  <th>Сумма</th>
                  <th style={{ textAlign: 'right' }}>Когда</th>
                </tr>
              </thead>
              <tbody>
                {promoRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="a-pill" style={{ background: r.type === 'VIP' ? 'var(--gold-bg)' : 'var(--red-bg)', color: r.type === 'VIP' ? 'var(--gold)' : 'var(--red)' }}>
                        {r.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 240 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.listing}</div>
                    </td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{r.buyer}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.days} дн.</td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(r.amount)}</td>
                    <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.when}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
          {tab === 'notifications' && (
            <>
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
                {notificationRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="log-tag">{r.type}</span>
                    </td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{r.recipient}</td>
                    <td>
                      <Channel c={r.channel} />
                    </td>
                    <td>
                      <ActionPill ok={r.status === 'sent'}>{r.status === 'sent' ? 'Доставлено' : 'Ошибка'}</ActionPill>
                    </td>
                    <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{r.when}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
        {count === 0 && (
          <div className="muted" style={{ padding: '32px 22px', textAlign: 'center', fontSize: 14 }}>
            Записей не найдено по заданным фильтрам.
          </div>
        )}
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>Показано {count} записей</div>
    </div>
  );
}
