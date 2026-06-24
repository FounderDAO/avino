/**
 * История рассылок — таблица всех рассылок на реальном API (RTK Query).
 * Фильтр по статусу, серверная пагинация. Клик по строке → /admin/broadcasts/{id}.
 * Вёрстка повторяет listings/users: классы a-*, abtn, a-table, пагинатор с pageItems.
 * Данные — GET /admin/broadcasts (ADR-0103).
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { IC } from '@/components/admin/icons';
import {
  StatusBadge,
  ChannelIcons,
  statusLabels,
  languageLabels,
  audienceLabels,
} from '@/components/admin/broadcast/shared';
import {
  useListBroadcastsQuery,
  type BroadcastStatusValue,
} from '@/store/api/adminBroadcastsApi';
import { totalPages } from '@/store/api/adminApi';

const LIMIT = 20;

/**
 * Оконный список номеров страниц с многоточием (как в listings/users):
 * для ≤7 страниц — все, иначе первая/последняя + текущая ±1, разрывы — '…'.
 */
function pageItems(current: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(pages - 1, current + 1);
  if (start > 2) out.push('…');
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

/** Форматирует ISO-дату в локализованную строку для рус. аудитории. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Статусы для фильтра: «Все» + все BroadcastStatusValue. */
const STATUS_FILTER_OPTIONS: [string, string][] = [
  ['ALL', 'Все'],
  ...Object.entries(statusLabels) as [BroadcastStatusValue, string][],
];

export default function BroadcastsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);

  // Смена фильтра — сброс на первую страницу.
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const { data, isLoading, isFetching, isError, refetch } = useListBroadcastsQuery({
    status: statusFilter === 'ALL' ? undefined : (statusFilter as BroadcastStatusValue),
    page,
    limit: LIMIT,
  });

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pages = totalPages(data?.meta);

  return (
    <div>
      {/* ── Заголовок ───────────────────────────────────────────────────────── */}
      <div
        className="row"
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <SectionTitle sub={`${total} рассылок всего`}>Рассылки</SectionTitle>
        <Link href="/admin/broadcasts/new" className="abtn abtn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IC.Plus size={17} /> Новая рассылка
        </Link>
      </div>

      {/* ── Фильтр по статусу ───────────────────────────────────────────────── */}
      <div className="row gap-8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {STATUS_FILTER_OPTIONS.map(([k, v]) => (
          <button
            key={k}
            onClick={() => setStatusFilter(k)}
            className="abtn abtn-sm"
            style={{
              background: statusFilter === k ? 'var(--ink)' : 'var(--surface)',
              color: statusFilter === k ? '#fff' : 'var(--ink)',
              border: statusFilter === k ? 'none' : '1.5px solid var(--border)',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* ── Таблица ─────────────────────────────────────────────────────────── */}
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить рассылки.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : (
        <div className="a-card table-scroll">
          <table className="a-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Заголовок</th>
                <th>Язык</th>
                <th>Каналы</th>
                <th>Аудитория</th>
                <th>Когда</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                    Загрузка…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                    Рассылок пока нет.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  // Поле «Когда»: sent_at → «Отправлена», scheduled_at → «Запланирована», иначе «—»
                  const whenLabel = row.sent_at
                    ? `Отправлена ${formatDate(row.sent_at)}`
                    : row.scheduled_at
                      ? `Запланирована ${formatDate(row.scheduled_at)}`
                      : '—';

                  return (
                    <tr
                      key={row.id}
                      className="clickable"
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/admin/broadcasts/${row.id}`)}
                    >
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {formatDate(row.created_at)}
                      </td>
                      <td style={{ minWidth: 200, maxWidth: 280 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.title}
                        </div>
                      </td>
                      <td className="muted">{languageLabels[row.language]}</td>
                      <td>
                        <ChannelIcons channels={row.channels} />
                      </td>
                      <td className="muted">
                        {audienceLabels[row.audience_type]}
                        {row.recipient_count > 0 && (
                          <span style={{ marginLeft: 4, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                            · {row.recipient_count}
                          </span>
                        )}
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {whenLabel}
                      </td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Пагинатор ───────────────────────────────────────────────────────── */}
      <div
        className="row"
        style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}
      >
        <span>
          {isFetching
            ? 'Обновление…'
            : total === 0
              ? 'Ничего не найдено'
              : `Показано ${rows.length} из ${total}${pages > 1 ? ` · стр. ${page} из ${pages}` : ''}`}
        </span>
        <div className="row gap-4">
          <button
            className="aicon-btn"
            style={{ width: 32, height: 32 }}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <IC.ChevronLeft size={16} />
          </button>
          {pages > 1
            ? pageItems(page, pages).map((it, i) =>
                it === '…' ? (
                  <span key={`gap-${i}`} style={{ width: 24, textAlign: 'center', color: 'var(--muted)' }}>
                    …
                  </span>
                ) : (
                  <button
                    key={it}
                    className="abtn abtn-sm"
                    style={
                      it === page
                        ? { background: 'var(--ink)', color: '#fff' }
                        : { background: 'var(--surface)', color: 'var(--ink)', border: '1.5px solid var(--border)' }
                    }
                    onClick={() => setPage(it)}
                  >
                    {it}
                  </button>
                ),
              )
            : (
                <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>
                  {page}
                </button>
              )}
          <button
            className="aicon-btn"
            style={{ width: 32, height: 32 }}
            disabled={pages > 0 && page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            <IC.ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
