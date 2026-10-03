/** История массовых импортов объявлений (спека 2026-10-03 §6). */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useListListingImportsQuery } from '@/store/api/adminListingImportsApi';

const LIMIT = 20;

export default function ListingImportsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useListListingImportsQuery({ page, limit: LIMIT });
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="fade-up">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
        <h1 style={{ fontSize: 24 }}>История импортов</h1>
        <Link href="/admin/listings" className="abtn abtn-ghost">К объявлениям</Link>
      </div>
      {isLoading && <p style={{ color: 'var(--muted)' }}>Загрузка…</p>}
      {isError && (
        <p style={{ color: 'var(--red)' }}>
          Не удалось загрузить историю. <button className="abtn abtn-ghost" onClick={() => void refetch()}>Повторить</button>
        </p>
      )}
      {data && (
        <div className="a-card table-scroll" style={{ overflow: 'auto' }}>
          <table className="a-table">
            <thead>
              <tr>
                <th>Файл</th>
                <th>Дата</th>
                <th>Кто</th>
                <th>Создано</th>
                <th>Пропущено</th>
                <th>Ошибок</th>
                <th>Фото</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((item) => (
                <tr key={item.id}>
                  <td style={{ overflowWrap: 'anywhere' }}>
                    <Link href={`/admin/listing-imports/${item.id}`} prefetch={false}>{item.file_name}</Link>
                    {item.incomplete && <span className="a-pill" style={{ marginLeft: 6, background: 'var(--red-bg)', color: 'var(--red)' }}>не завершён</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(item.created_at).toLocaleString('ru-RU')}</td>
                  <td>{item.created_by.name ?? '—'}</td>
                  <td>{item.summary.created}</td>
                  <td>{item.summary.skipped_exists + item.summary.skipped_duplicate_in_file}</td>
                  <td>{item.summary.errors}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {item.photos_summary.total === 0 ? '—' : `${item.photos_summary.done} / ${item.photos_summary.total}`}
                    {item.photos_summary.failed + item.photos_summary.awaiting_upload > 0 && (
                      <span style={{ color: 'var(--red)' }}> · {item.photos_summary.failed + item.photos_summary.awaiting_upload} не загружено</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: 'var(--muted)' }}>Импортов ещё не было</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="row gap-8" style={{ justifyContent: 'flex-end', marginTop: 12, alignItems: 'center' }}>
          <button className="abtn abtn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
          <span style={{ fontSize: 13 }}>{page} / {pages}</span>
          <button className="abtn abtn-outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Вперёд</button>
        </div>
      )}
    </div>
  );
}
