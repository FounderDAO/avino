/**
 * Заявки агентов (ADR-0140, API.md §21) — очередь модерации заявок
 * «Стать агентом».
 *
 * GET /admin/agent-applications — фильтр по статусу (чипы, default PENDING),
 * серверная пагинация. Approve — сразу из строки (бэкенд транзакционно выдаёт
 * роль AGENT + уведомление); reject — модалка с опциональной причиной.
 * Мутации инвалидируют тег Admin → список перечитывается.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { Pill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { DEFAULT_LIMIT, totalPages } from '@/store/api/adminApi';
import { getApiErrorCode } from '@/store/api/apiError';
import {
  useApproveAgentApplicationMutation,
  useListAdminAgentApplicationsQuery,
  useRejectAgentApplicationMutation,
} from '@/store/api/adminAgentApplicationsApi';
import type { AgentApplicationStatus } from '@/store/api/adminTypes';
import {
  AGENT_APPLICATION_STATUS_MAP,
  agentApplicationToRow,
} from '@/lib/adapters/agent-applications';
import type { AgentApplicationRow } from '@/lib/adapters/agent-applications';

type StatusFilter = 'ALL' | AgentApplicationStatus;

const statusFilters: [StatusFilter, string][] = [
  ['PENDING', 'Ожидают'],
  ['APPROVED', 'Одобренные'],
  ['REJECTED', 'Отклонённые'],
  ['ALL', 'Все'],
];

/** 422 INVALID_STATUS_TRANSITION → заявку уже решил другой модератор. */
function actionErrorMessage(err: unknown, fallback: string): string {
  const code = getApiErrorCode(err as Parameters<typeof getApiErrorCode>[0]);
  if (code === 'INVALID_STATUS_TRANSITION') return 'Заявка уже обработана';
  return fallback;
}

function RejectModal({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: AgentApplicationRow;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up a-card" style={{ width: '100%', maxWidth: 460, padding: 26, borderRadius: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ fontSize: 22 }}>Отклонить заявку</h2>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} onClick={onClose}><IC.X size={18} /></button>
        </div>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
          {row.userName} · {row.agency}
        </p>
        <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Причина (необязательно)</label>
        <textarea
          className="a-field"
          style={{ width: '100%', minHeight: 90, resize: 'vertical', marginBottom: 14 }}
          placeholder="Будет показана заявителю…"
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="row gap-10">
          <button className="abtn abtn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => onConfirm(reason)}>
            {busy ? 'Отклонение…' : 'Отклонить'}
          </button>
          <button className="abtn abtn-outline" disabled={busy} onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

export default function AgentApplicationsPage() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<AgentApplicationRow | null>(null);

  // Смена фильтра — на первую страницу.
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data, isLoading, isFetching, isError, refetch } =
    useListAdminAgentApplicationsQuery({
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      page,
      limit: DEFAULT_LIMIT,
    });

  const [approve, { isLoading: isApproving }] = useApproveAgentApplicationMutation();
  const [reject, { isLoading: isRejecting }] = useRejectAgentApplicationMutation();
  const busy = isApproving || isRejecting;

  const rows = (data?.data ?? []).map(agentApplicationToRow);
  const total = data?.meta.total ?? 0;
  const pages = totalPages(data?.meta);

  const onApprove = async (id: string) => {
    try {
      await approve(id).unwrap();
      toast('Заявка одобрена — роль агента выдана');
    } catch (err) {
      toast(actionErrorMessage(err, 'Не удалось одобрить заявку'));
    }
  };

  const onReject = async (id: string, reason: string) => {
    try {
      await reject({ id, reason: reason.trim() || undefined }).unwrap();
      toast('Заявка отклонена');
      setRejecting(null);
    } catch (err) {
      toast(actionErrorMessage(err, 'Не удалось отклонить заявку'));
      setRejecting(null);
    }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <SectionTitle sub={`${total} заявок всего`}>Заявки агентов</SectionTitle>
      </div>
      <div className="row gap-8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {statusFilters.map(([k, v]) => (
          <button key={k} onClick={() => setStatusFilter(k)} className="abtn abtn-sm" style={{ background: statusFilter === k ? 'var(--ink)' : 'var(--surface)', color: statusFilter === k ? '#fff' : 'var(--ink)', border: statusFilter === k ? 'none' : '1.5px solid var(--border)' }}>{v}</button>
        ))}
      </div>
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить заявки.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : (
        <div className="a-card table-scroll">
          <table className="a-table">
            <thead><tr><th>Заявитель</th><th>Агентство</th><th>О себе</th><th>Подана</th><th>Статус</th><th></th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 40 }}>Загрузка…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 40 }}>Заявок нет — очередь чиста.</td></tr>
              ) : (
                rows.map((r) => {
                  const [label, color, bg] = AGENT_APPLICATION_STATUS_MAP[r.status];
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/admin/users/${r.userId}`} className="row gap-10" style={{ alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
                          {r.avatarUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={r.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--mint)', color: 'var(--teal-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                              {(r.userName[0] ?? '?').toUpperCase()}
                            </span>
                          )}
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.userName}</span>
                            <span className="muted mono" style={{ display: 'block', fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.userPhone}</span>
                          </span>
                        </Link>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.agency}</td>
                      <td style={{ maxWidth: 320 }}>
                        <div className="muted" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.about}>{r.about}</div>
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{r.created}</td>
                      <td>
                        <Pill bg={bg} color={color}>{label}</Pill>
                        {r.status !== 'PENDING' && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 4, whiteSpace: 'nowrap' }}>{r.resolved}</div>
                        )}
                        {r.status === 'REJECTED' && r.rejectReason && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.rejectReason}>{r.rejectReason}</div>
                        )}
                      </td>
                      <td>
                        {r.status === 'PENDING' && (
                          <div className="row gap-6" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="abtn abtn-ok abtn-sm" disabled={busy} onClick={() => onApprove(r.id)}><IC.Check size={15} /> Одобрить</button>
                            <button className="abtn abtn-danger abtn-sm" disabled={busy} onClick={() => setRejecting(r)}><IC.X size={15} /> Отклонить</button>
                          </div>
                        )}
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
      {rejecting && (
        <RejectModal
          row={rejecting}
          busy={isRejecting}
          onConfirm={(reason) => onReject(rejecting.id, reason)}
          onClose={() => setRejecting(null)}
        />
      )}
    </div>
  );
}
