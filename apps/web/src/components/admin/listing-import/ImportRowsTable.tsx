// apps/web/src/components/admin/listing-import/ImportRowsTable.tsx
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { ListingImportReport } from '@/store/api/adminTypes';
import { importRowToView, rowPhotoText, type LocalFile, type LocalMatch } from '@/lib/adapters/listingImports';

const TONE_COLOR = { ok: 'var(--green)', skip: 'var(--muted)', error: 'var(--red)' } as const;

/** Таблица строк отчёта — общая для предпросмотра, результата и истории. */
export function ImportRowsTable({
  report,
  matches,
  onlyProblems,
}: {
  report: ListingImportReport;
  matches: Map<string, LocalMatch<LocalFile>> | null;
  onlyProblems: boolean;
}) {
  const rows = useMemo(() => {
    const views = report.rows.map((row) => ({ view: importRowToView(row), photos: rowPhotoText(row, matches) }));
    return onlyProblems ? views.filter((v) => v.view.tone !== 'ok') : views;
  }, [report, matches, onlyProblems]);

  return (
    <div className="a-card table-scroll" style={{ overflow: 'auto', flex: 1, minHeight: 120 }}>
      <table className="a-table">
        <thead>
          <tr>
            <th>Строка</th>
            <th>Телефон</th>
            <th>Заголовок</th>
            <th>Итог</th>
            <th>Фото</th>
            <th>Подробности</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ view: v, photos }) => (
            <tr key={v.row}>
              <td>{v.row}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{v.phone}</td>
              <td>
                <div title={v.title} style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
              </td>
              <td style={{ color: TONE_COLOR[v.tone], fontWeight: 700, whiteSpace: 'nowrap' }}>{v.label}</td>
              <td style={{ fontSize: 13 }}>{photos}</td>
              <td style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                {v.listingId ? (
                  <Link href={`/admin/listings/${v.listingId}`} target="_blank" prefetch={false}>
                    {v.reference ? `Объявление № ${v.reference}` : 'Открыть объявление'}
                  </Link>
                ) : (
                  v.reason
                )}
                {v.listingId && v.tone === 'ok' && v.reason ? ` · ${v.reason}` : ''}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: 'var(--muted)' }}>Проблемных строк нет</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
