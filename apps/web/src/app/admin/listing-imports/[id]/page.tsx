/** Сохранённый отчёт импорта с фото: повтор ссылок и дозагрузка из папки. */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ImportPhotosPanel } from '@/components/admin/listing-import/ImportPhotosPanel';
import { ImportRowsTable } from '@/components/admin/listing-import/ImportRowsTable';
import { useGetListingImportQuery } from '@/store/api/adminListingImportsApi';
import type { ListingImportReport } from '@/store/api/adminTypes';

// Стабильная ссылка: панель перезапускает начальную загрузку при смене identity массива.
const NO_FILES: File[] = [];

export default function ListingImportReportPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useGetListingImportQuery(id);
  const [report, setReport] = useState<ListingImportReport | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  useEffect(() => {
    if (data) setReport(data);
  }, [data]);

  return (
    <div className="fade-up">
      <Link href="/admin/listing-imports" className="abtn abtn-ghost" style={{ marginBottom: 14, paddingLeft: 0 }}>← История импортов</Link>
      {isLoading && <p style={{ color: 'var(--muted)' }}>Загрузка…</p>}
      {isError && <p style={{ color: 'var(--red)' }}>Импорт не найден</p>}
      {report && (
        <>
          <h1 style={{ fontSize: 22, marginBottom: 6, overflowWrap: 'anywhere' }}>{report.file_name}</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Создано {report.summary.created} · уже существует {report.summary.skipped_exists} · повтор в файле {report.summary.skipped_duplicate_in_file} · ошибок {report.summary.errors}
            {report.incomplete && ' · импорт был прерван'}
          </p>
          <ImportPhotosPanel key={report.id} report={report} initialFiles={NO_FILES} onReportChange={setReport} />
          <label className="row gap-8" style={{ fontSize: 13, marginBottom: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
            Только проблемные строки
          </label>
          <ImportRowsTable report={report} matches={null} onlyProblems={onlyProblems} />
        </>
      )}
    </div>
  );
}
