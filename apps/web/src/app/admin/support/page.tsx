/**
 * Обращения в поддержку — реальный API (RTK Query).
 *
 * GET /admin/support/requests — фильтр по статусу (чипы), серверная пагинация.
 * PATCH /admin/support/requests/:id — «В работу» / «Решено»; handled_by/
 * handled_at проставляет сервер. Мутация инвалидирует тег Admin.
 */
'use client';

import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { Pill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { DEFAULT_LIMIT, totalPages } from '@/store/api/adminApi';
import {
  useListAdminSupportRequestsQuery,
  useUpdateAdminSupportRequestStatusMutation,
} from '@/store/api/adminSupportApi';
import type { SupportRequestStatus } from '@/store/api/adminTypes';
import { SUPPORT_STATUS_MAP, supportRequestToRow } from '@/lib/adapters/support';

type StatusFilter = 'ALL' | SupportRequestStatus;

const statusFilters: [StatusFilter, string][] = [
  ['ALL', 'Все'],
  ['NEW', 'Новые'],
  ['IN_REVIEW', 'В работе'],
  ['RESOLVED', 'Решённые'],
];

const SUCCESS_TOAST: Record<SupportRequestStatus, string> = {
  NEW: 'Обращение возвращено в новые',
  IN_REVIEW: 'Обращение взято в работу',
  RESOLVED: 'Обращение решено',
};

export default function SupportPage() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);

  // Смена фильтра — на первую страницу.
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data, isLoading, isFetching, isError, refetch } = useListAdminSupportRequestsQuery({
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    page,
    limit: DEFAULT_LIMIT,
  });

  const [updateStatus, { isLoading: isUpdating }] = useUpdateAdminSupportRequestStatusMutation();

  const rows = (data?.data ?? []).map(supportRequestToRow);
  const total = data?.meta.total ?? 0;
  const pages = totalPages(data?.meta);

  const onSetStatus = async (id: string, status: SupportRequestStatus) => {
    try {
      await updateStatus({ id, status }).unwrap();
      toast(SUCCESS_TOAST[status]);
    } catch {
      toast('Не удалось обновить обращение');
    }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <SectionTitle sub={`${total} обращений всего`}>Обращения</SectionTitle>
      </div>
      <div className="row gap-8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {statusFilters.map(([k, v]) => (
          <button key={k} onClick={() => setStatusFilter(k)} className="abtn abtn-sm" style={{ background: statusFilter === k ? 'var(--ink)' : 'var(--surface)', color: statusFilter === k ? '#fff' : 'var(--ink)', border: statusFilter === k ? 'none' : '1.5px solid var(--border)' }}>{v}</button>
        ))}
      </div>
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить обращения.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : (
        <div className="a-card table-scroll">
          <table className="a-table">
            <thead><tr><th>Сообщение</th><th>Автор</th><th>Контакт</th><th>Статус</th><th>Создано</th><th>Обработано</th><th></th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>Загрузка…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>Обращений нет — очередь чиста.</td></tr>
              ) : (
                rows.map((r) => {
                  const [label, color, bg] = SUPPORT_STATUS_MAP[r.status];
                  const open = r.status === 'NEW' || r.status === 'IN_REVIEW';
                  return (
                    <tr key={r.id}>
                      <td style={{ maxWidth: 380 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.message}>{r.message}</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.author}</td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{r.contact}</td>
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
                            <button className="abtn abtn-ok abtn-sm" disabled={isUpdating} onClick={() => onSetStatus(r.id, 'RESOLVED')}>Решено</button>
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
    </div>
  );
}
