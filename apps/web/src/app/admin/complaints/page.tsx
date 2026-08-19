/**
 * Жалобы на объявления (ADMIN-10) — реальный API (RTK Query).
 *
 * GET /admin/complaints — фильтр по статусу (чипы) и listing_id (текст с
 * дебаунсом, как UUID-фильтры в /admin/logs), серверная пагинация.
 * PATCH /admin/complaints/:id — «В работу» / «Решена» / «Отклонить»;
 * handled_by/handled_at проставляет сервер. Мутация инвалидирует тег Admin →
 * список, KPI «Жалобы» и бейдж сайдбара обновляются сами.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { Pill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { DEFAULT_LIMIT, totalPages } from '@/store/api/adminApi';
import {
  useListAdminComplaintsQuery,
  useUpdateAdminComplaintStatusMutation,
} from '@/store/api/adminComplaintsApi';
import type { ComplaintStatus } from '@/store/api/adminTypes';
import { COMPLAINT_STATUS_MAP, complaintReasonLabel, complaintToRow } from '@/lib/adapters/complaints';
import type { ComplaintRow } from '@/lib/adapters/complaints';

type StatusFilter = 'ALL' | ComplaintStatus;

const statusFilters: [StatusFilter, string][] = [
  ['ALL', 'Все'],
  ['NEW', 'Новые'],
  ['IN_REVIEW', 'В работе'],
  ['RESOLVED', 'Решённые'],
  ['REJECTED', 'Отклонённые'],
];

const SUCCESS_TOAST: Record<ComplaintStatus, string> = {
  NEW: 'Жалоба возвращена в новые',
  IN_REVIEW: 'Жалоба взята в работу',
  RESOLVED: 'Жалоба решена',
  REJECTED: 'Жалоба отклонена',
};

/**
 * Модалка чтения жалобы: полный текст (в таблице он обрезан), метаданные
 * (причина/объявление/заявитель/даты) и те же действия, что в строке.
 */
function ComplaintViewModal({
  row,
  busy,
  onSetStatus,
  onClose,
}: {
  row: ComplaintRow;
  busy: boolean;
  onSetStatus: (id: string, status: ComplaintStatus) => void;
  onClose: () => void;
}) {
  const [label, color, bg] = COMPLAINT_STATUS_MAP[row.status];
  const open = row.status === 'NEW' || row.status === 'IN_REVIEW';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up a-card" style={{ width: '100%', maxWidth: 560, padding: 26, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
          <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 22 }}>Жалоба</h2>
            <Pill bg={bg} color={color}>{label}</Pill>
          </div>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} onClick={onClose}><IC.X size={18} /></button>
        </div>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap', marginBottom: 16, fontSize: 13.5 }}>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Причина</div>
            <div style={{ fontWeight: 600 }}>{complaintReasonLabel(row.reason)}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Объявление</div>
            <Link href={`/admin/listings/${row.listingId}`} className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>
              {row.listingShort} →
            </Link>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Заявитель</div>
            {row.reporterId ? (
              <Link href={`/admin/users/${row.reporterId}`} className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                {row.reporter} →
              </Link>
            ) : (
              <div className="mono">{row.reporter}</div>
            )}
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Создана</div>
            <div>{row.created}</div>
          </div>
          {row.handled !== '—' && (
            <div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Обработана</div>
              <div>{row.handled} <span className="mono muted">{row.handledBy}</span></div>
            </div>
          )}
        </div>
        {row.details && (
          <>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Текст жалобы</div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '45vh', overflowY: 'auto', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: 14, fontSize: 14.5, lineHeight: 1.5 }}>
              {row.details}
            </div>
          </>
        )}
        {open && (
          <div className="row gap-10" style={{ marginTop: 18 }}>
            {row.status === 'NEW' && (
              <button className="abtn abtn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => onSetStatus(row.id, 'IN_REVIEW')}>В работу</button>
            )}
            <button className="abtn abtn-ok" style={{ flex: 1 }} disabled={busy} onClick={() => onSetStatus(row.id, 'RESOLVED')}>Решена</button>
            <button className="abtn abtn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => onSetStatus(row.id, 'REJECTED')}>Отклонить</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComplaintsPage() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [listingId, setListingId] = useState('');
  const [debouncedListingId, setDebouncedListingId] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<ComplaintRow | null>(null);

  // Дебаунс фильтра listing_id (400мс), чтобы не дёргать API на каждый символ.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedListingId(listingId), 400);
    return () => clearTimeout(t);
  }, [listingId]);

  // Смена фильтра — на первую страницу.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedListingId]);

  const { data, isLoading, isFetching, isError, refetch } = useListAdminComplaintsQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    listing_id: debouncedListingId.trim() || undefined,
    page,
    limit: DEFAULT_LIMIT,
  });

  const [updateStatus, { isLoading: isUpdating }] = useUpdateAdminComplaintStatusMutation();

  const rows = (data?.data ?? []).map(complaintToRow);
  const total = data?.meta.total ?? 0;
  const pages = totalPages(data?.meta);

  const onSetStatus = async (id: string, status: ComplaintStatus) => {
    try {
      await updateStatus({ id, status }).unwrap();
      toast(SUCCESS_TOAST[status]);
      setViewing(null);
    } catch {
      toast('Не удалось обновить жалобу');
    }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <SectionTitle sub={`${total} жалоб всего`}>Жалобы</SectionTitle>
      </div>
      <div className="row gap-8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', minWidth: 240 }}>
          <IC.Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input className="a-field" style={{ paddingLeft: 36, width: '100%' }} placeholder="ID объявления (UUID)…" value={listingId} onChange={(e) => setListingId(e.target.value)} />
        </div>
        {statusFilters.map(([k, v]) => (
          <button key={k} onClick={() => setStatusFilter(k)} className="abtn abtn-sm" style={{ background: statusFilter === k ? 'var(--ink)' : 'var(--surface)', color: statusFilter === k ? '#fff' : 'var(--ink)', border: statusFilter === k ? 'none' : '1.5px solid var(--border)' }}>{v}</button>
        ))}
      </div>
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить жалобы.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : (
        <div className="a-card table-scroll">
          <table className="a-table">
            <thead><tr><th>Жалоба</th><th>Объявление</th><th>Заявитель</th><th>Статус</th><th>Создана</th><th>Обработана</th><th></th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>Загрузка…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>Жалоб нет — очередь чиста.</td></tr>
              ) : (
                rows.map((r) => {
                  const [label, color, bg] = COMPLAINT_STATUS_MAP[r.status];
                  const open = r.status === 'NEW' || r.status === 'IN_REVIEW';
                  return (
                    <tr key={r.id}>
                      <td style={{ maxWidth: 340 }}>
                        <button
                          type="button"
                          onClick={() => setViewing(r)}
                          title="Открыть жалобу"
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink)', font: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          <b>{complaintReasonLabel(r.reason)}</b>
                          {r.details && (
                            <div className="muted" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.details}>{r.details}</div>
                          )}
                        </button>
                      </td>
                      <td>
                        <Link href={`/admin/listings/${r.listingId}`} className="mono" style={{ color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {r.listingShort} →
                        </Link>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.reporterId ? (
                          <Link href={`/admin/users/${r.reporterId}`} className="mono" style={{ color: 'var(--teal)', fontWeight: 600 }}>
                            {r.reporter} →
                          </Link>
                        ) : (
                          <span className="muted mono">{r.reporter}</span>
                        )}
                      </td>
                      <td><Pill bg={bg} color={color}>{label}</Pill></td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{r.created}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {r.handled === '—' ? '—' : (
                          <>
                            {r.handled}
                            <div className="mono" style={{ fontSize: 12 }}>{r.handledBy}</div>
                          </>
                        )}
                      </td>
                      <td>
                        <div className="row gap-6" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {r.status === 'NEW' && (
                            <button className="abtn abtn-outline abtn-sm" disabled={isUpdating} onClick={() => onSetStatus(r.id, 'IN_REVIEW')}>В работу</button>
                          )}
                          {open && (
                            <>
                              <button className="abtn abtn-ok abtn-sm" disabled={isUpdating} onClick={() => onSetStatus(r.id, 'RESOLVED')}>Решена</button>
                              <button className="abtn abtn-danger abtn-sm" disabled={isUpdating} onClick={() => onSetStatus(r.id, 'REJECTED')}>Отклонить</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
        <span>{isFetching ? 'Обновление…' : `Показано ${rows.length} из ${total}`}</span>
        <div className="row gap-4">
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><IC.ChevronLeft size={16} /></button>
          <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>{page}</button>
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={pages > 0 && page >= pages} onClick={() => setPage((p) => p + 1)}><IC.ChevronRight size={16} /></button>
        </div>
      </div>
      {viewing && (
        <ComplaintViewModal
          row={viewing}
          busy={isUpdating}
          onSetStatus={onSetStatus}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
