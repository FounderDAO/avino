// apps/web/src/components/admin/listing-import/ImportPhotosPanel.tsx
/**
 * Фото сохранённого импорта: загрузка из папки, прогресс скачивания ссылок
 * (опрос счётчиков, пока есть PENDING), проблемные фото по объявлениям, повтор
 * ссылок и дозагрузка из папки. Общий для результата модалки и страницы истории.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/admin/toast';
import { useImportPhotoUploader } from '@/hooks/useImportPhotoUploader';
import {
  useGetListingImportPhotoSummaryQuery,
  useLazyGetListingImportQuery,
  useRetryListingImportPhotosMutation,
} from '@/store/api/adminListingImportsApi';
import type { ListingImportPhoto, ListingImportReport } from '@/store/api/adminTypes';
import { matchLocalPhotos, photoStatusText, photoUploadQueue } from '@/lib/adapters/listingImports';
import { FolderPicker } from './FolderPicker';

function Bar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, marginBottom: 4 }}>{label}: {done} / {total}</div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--teal-deep)' }} />
      </div>
    </div>
  );
}

export function ImportPhotosPanel({
  report,
  initialFiles,
  onReportChange,
}: {
  report: ListingImportReport;
  initialFiles: File[];
  onReportChange: (report: ListingImportReport) => void;
}) {
  const toast = useToast();
  const importId = report.id as string;
  const uploader = useImportPhotoUploader(importId);
  const [refetchReport] = useLazyGetListingImportQuery();
  const [retry, { isLoading: retrying }] = useRetryListingImportPhotosMutation();
  const [files, setFiles] = useState<File[]>(initialFiles);
  const startedFor = useRef<File[] | null>(null);

  const urlTotal = report.rows.flatMap((r) => r.photos ?? []).filter((p) => p.id && p.source === 'URL').length;
  // Момент включения опроса: кэш RTK может хранить старый ответ с pending = 0
  // (прошлый визит или до «Повторить ссылки») — останавливаемся только по ответу,
  // полученному ПОСЛЕ включения.
  const [armedAt, setArmedAt] = useState<number | null>(() => (report.photos_summary.pending > 0 ? Date.now() : null));
  const { data: summary, isFetching, fulfilledTimeStamp } = useGetListingImportPhotoSummaryQuery(importId, {
    pollingInterval: 3000,
    skip: armedAt === null,
    refetchOnMountOrArgChange: true,
  });
  const pollPending = armedAt !== null;

  // Ссылки докачались — один раз перечитываем полный отчёт.
  useEffect(() => {
    if (armedAt === null || isFetching || !summary || (fulfilledTimeStamp ?? 0) <= armedAt) return;
    if (summary.pending === 0) {
      setArmedAt(null);
      void refetchReport(importId).unwrap().then(onReportChange).catch(() => undefined);
    }
  }, [armedAt, isFetching, summary, fulfilledTimeStamp, importId, refetchReport, onReportChange]);

  async function uploadFrom(selected: File[]) {
    const queue = photoUploadQueue(report);
    const matches = matchLocalPhotos(queue.map((p) => p.ref), selected);
    const byRef = new Map<string, File>();
    for (const [key, match] of matches) if (match.kind === 'FOUND') byRef.set(key, match.file);
    await uploader.start(queue, byRef);
    onReportChange(await refetchReport(importId).unwrap());
  }

  // Файлы, выбранные на первом шаге, грузятся сразу после запуска импорта.
  useEffect(() => {
    if (initialFiles.length > 0 && startedFor.current !== initialFiles) {
      startedFor.current = initialFiles;
      void uploadFrom(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  const problems = useMemo(() => {
    const groups: { listingId: string | null; reference: number | null; photos: ListingImportPhoto[] }[] = [];
    for (const row of report.rows) {
      const bad = (row.photos ?? []).filter((p) => p.id && (p.status === 'FAILED' || p.status === 'AWAITING_UPLOAD'));
      if (bad.length > 0) groups.push({ listingId: row.listing_id ?? null, reference: row.listing_reference ?? null, photos: bad });
    }
    return groups;
  }, [report]);

  const failedUrls = report.rows.flatMap((r) => r.photos ?? []).filter((p) => p.source === 'URL' && p.status === 'FAILED').length;
  // Пока опрос не дал свежего ответа — счётчики из отчёта.
  const s = pollPending && summary && (fulfilledTimeStamp ?? 0) > (armedAt ?? 0) ? summary : report.photos_summary;
  if (report.photos_summary.total === 0) return null;

  async function onRetry() {
    try {
      const { queued } = await retry(importId).unwrap();
      toast(`Ссылок поставлено в очередь: ${queued}`);
      onReportChange(await refetchReport(importId).unwrap());
      if (queued > 0) setArmedAt(Date.now());
    } catch {
      toast('Не удалось повторить ссылки');
    }
  }

  return (
    <div className="a-card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Фото: загружено {s.done} из {s.total}{s.failed > 0 ? `, ошибок ${s.failed}` : ''}</div>
      {uploader.progress && <Bar label="Загрузка из папки" done={uploader.progress.done} total={uploader.progress.total} />}
      {urlTotal > 0 && pollPending && <Bar label="Скачивание по ссылкам" done={urlTotal - s.pending} total={urlTotal} />}
      {uploader.active && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Не закрывайте вкладку, пока идёт загрузка.</p>}

      {problems.length > 0 && !uploader.active && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>Проблемные фото ({problems.reduce((n, g) => n + g.photos.length, 0)})</summary>
          <ul style={{ fontSize: 13, marginTop: 6, paddingLeft: 18 }}>
            {problems.map((group) => (
              <li key={group.listingId ?? group.photos[0].id} style={{ marginBottom: 6 }}>
                {group.listingId ? (
                  <Link href={`/admin/listings/${group.listingId}`} target="_blank" prefetch={false}>
                    {group.reference ? `Объявление № ${group.reference}` : 'Объявление'}
                  </Link>
                ) : 'Объявление'}
                <ul style={{ paddingLeft: 16 }}>
                  {group.photos.map((p) => (
                    <li key={p.id} style={{ overflowWrap: 'anywhere' }}>
                      {p.ref} — {uploader.errors.get(p.id as string) ?? photoStatusText(p)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="row gap-8" style={{ marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {failedUrls > 0 && (
          <button className="abtn abtn-outline" disabled={retrying || uploader.active} onClick={() => void onRetry()}>
            Повторить ссылки ({failedUrls})
          </button>
        )}
        {photoUploadQueue(report).length > 0 && (
          <FolderPicker
            files={files}
            disabled={uploader.active}
            onChange={(picked) => {
              setFiles(picked);
              void uploadFrom(picked);
            }}
          />
        )}
      </div>
    </div>
  );
}
