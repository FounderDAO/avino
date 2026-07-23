'use client';

/**
 * OTP-история — журнал запросов одноразовых кодов (`GET /admin/otp-logs`).
 * Только просмотр. Сценарий поддержки: по жалобе «код не пришёл» найти контакт
 * (поиск с дебаунсом) и увидеть коды, статусы («Погашен» = использован или
 * заменён новым) и попытки ввода. Серверная пагинация; loading/empty/error —
 * как на /admin/logs.
 */
import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { IC } from '@/components/admin/icons';
import { DEFAULT_LIMIT, totalPages } from '@/store/api/adminApi';
import { useListOtpLogsQuery } from '@/store/api/adminLogsApi';
import type { OtpLogStatus } from '@/store/api/adminTypes';
import { otpLogToRow } from '@/lib/adapters/logs';

const DEBOUNCE_MS = 400;

const STATUS_STYLE: Record<OtpLogStatus, { bg: string; color: string }> = {
  ACTIVE: { bg: 'var(--surface-2)', color: 'var(--ink)' },
  CONSUMED: { bg: 'var(--green-bg)', color: 'var(--green)' },
  EXPIRED: { bg: 'var(--red-bg)', color: 'var(--red)' },
};

export default function OtpHistoryPage() {
  const [destination, setDestination] = useState('');
  const [page, setPage] = useState(1);

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(destination), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [destination]);

  useEffect(() => setPage(1), [debounced]);

  const { data, isLoading, isFetching, isError, refetch } = useListOtpLogsQuery({
    destination: debounced.trim() || undefined,
    page,
    limit: DEFAULT_LIMIT,
  });

  const rows = (data?.data ?? []).map(otpLogToRow);
  const total = data?.meta?.total ?? 0;
  const pages = totalPages(data?.meta);

  return (
    <div>
      <SectionTitle sub="Журнал запросов одноразовых кодов. «Погашен» — код использован или заменён новым. Только просмотр.">
        OTP-история
      </SectionTitle>
      <div style={{ maxWidth: 360, marginBottom: 16 }}>
        <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Контакт
        </label>
        <input
          className="a-field"
          style={{ width: '100%' }}
          placeholder="+99890… или email"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
      </div>
      <div className="a-card table-scroll">
        <table className="a-table">
          <thead>
            <tr>
              <th>Контакт</th>
              <th>Канал</th>
              <th>Назначение</th>
              <th>Статус</th>
              <th>Попытки</th>
              <th>Пользователь</th>
              <th style={{ textAlign: 'right' }}>Когда</th>
            </tr>
          </thead>
          <tbody>
            {isError && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ marginBottom: 12 }}>Не удалось загрузить журнал.</div>
                  <button className="abtn abtn-outline" onClick={refetch}>
                    Повторить
                  </button>
                </td>
              </tr>
            )}
            {!isError && isLoading && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isError && !isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                  Записей не найдено.
                </td>
              </tr>
            )}
            {!isError &&
              !isLoading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {r.destination}
                  </td>
                  <td>
                    <span className="a-pill" style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                      {r.channelLabel}
                    </span>
                  </td>
                  <td className="muted">{r.purposeLabel}</td>
                  <td>
                    <span className="a-pill" style={{ background: STATUS_STYLE[r.status].bg, color: STATUS_STYLE[r.status].color }}>
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="muted">{r.attempts}</td>
                  <td className="muted mono" style={{ whiteSpace: 'nowrap' }}>
                    {r.user}
                  </td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.when}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
        <span>{isFetching ? 'Обновление…' : `Показано ${rows.length} из ${total}`}</span>
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
    </div>
  );
}
