/**
 * Модалка массового импорта объявлений (API.md §16, ADR-0162). Три шага:
 * файл → предпросмотр (dry_run, в БД ничего не пишется) → результат.
 * Вёрстка зеркалит остальные модалки админки (оверлей + fade-up a-card).
 * Мутации живут внутри модалки, чтобы ошибку файла показать на месте.
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import {
  useDownloadListingImportTemplateMutation,
  usePreviewListingImportMutation,
  useRunListingImportMutation,
} from '@/store/api/adminListingImportsApi';
import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { ListingImportReport } from '@/store/api/adminTypes';
import { getApiErrorCode } from '@/store/api/apiError';
import {
  IMPORT_RUN_UNKNOWN_TEXT,
  importButtonLabel,
  importFileErrorText,
  importRowToView,
  isImportFileErrorCode,
} from '@/lib/adapters/listingImports';

interface ListingImportModalProps {
  onClose: () => void;
}

const TONE_COLOR = { ok: 'var(--green)', skip: 'var(--muted)', error: 'var(--red)' } as const;

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="a-card" style={{ padding: '10px 14px', minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}

export function ListingImportModal({ onClose }: ListingImportModalProps) {
  const showToast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ListingImportReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const [preview, { isLoading: previewing }] = usePreviewListingImportMutation();
  const [run, { isLoading: running }] = useRunListingImportMutation();
  const [downloadTemplate, { isLoading: downloading }] = useDownloadListingImportTemplateMutation();
  const busy = previewing || running;
  // Закрыть нельзя только во время реального запуска; предпросмотр ничего не пишет.
  const closeLocked = running;
  // Недоступная кнопка выглядит неактивной (как в AmenityFormModal).
  const dim = (off: boolean) => (off ? { opacity: 0.5 } : {});

  const done = report !== null && !report.dry_run;
  const rows = useMemo(() => {
    const views = (report?.rows ?? []).map(importRowToView);
    return onlyProblems ? views.filter((v) => v.tone !== 'ok') : views;
  }, [report, onlyProblems]);

  /**
   * Предпросмотр файла (dry_run). `keepMessage` — текст, который нужно оставить
   * на экране после обновления отчёта (иначе ошибка сбрасывается).
   */
  async function loadPreview(target: File, keepMessage: string | null) {
    setReport(null);
    setErr(keepMessage);
    try {
      setReport(await preview(target).unwrap());
    } catch (e) {
      // Предпросмотр не удался: отчёта нет, показываем причину этого сбоя.
      setErr(importFileErrorText(getApiErrorCode(e as FetchBaseQueryError | SerializedError)));
    }
  }

  async function onPick(picked: File | null) {
    setFile(picked);
    setReport(null);
    setErr(null);
    if (!picked) return;
    await loadPreview(picked, null);
  }

  async function onRun() {
    if (!file || busy) return;
    setErr(null);
    try {
      const result = await run(file).unwrap();
      setReport(result);
      showToast(`Импорт завершён: создано ${result.summary.created}`);
    } catch (e) {
      const code = getApiErrorCode(e as FetchBaseQueryError | SerializedError);
      if (isImportFileErrorCode(code)) {
        // Отказ по файлу/блокировке: превью остаётся, можно повторить.
        setErr(importFileErrorText(code));
      } else {
        // Ответ не получен: импорт мог выполниться — перепроверяем файл заново.
        await loadPreview(file, IMPORT_RUN_UNKNOWN_TEXT);
      }
    }
  }

  async function onTemplate() {
    try {
      const url = await downloadTemplate().unwrap();
      const link = document.createElement('a');
      link.href = url;
      link.download = 'avino-listing-import.xlsx';
      link.click();
      // Сразу отзывать нельзя: часть браузеров обрывает скачивание.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      showToast('Не удалось скачать шаблон');
    }
  }

  const summary = report?.summary;

  return (
    <div
      onClick={closeLocked ? undefined : onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-up a-card"
        style={{ width: '100%', maxWidth: 920, maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 26, borderRadius: 16 }}
      >
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22 }}>{done ? 'Импорт завершён' : 'Импорт объявлений'}</h2>
          <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none', ...dim(closeLocked) }} onClick={onClose} disabled={closeLocked} aria-label="Закрыть">
            <IC.X size={18} />
          </button>
        </div>

        {!done && (
          <div className="row gap-8" style={{ marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              hidden
              onChange={(e) => {
                void onPick(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <button className="abtn abtn-outline" style={dim(busy)} onClick={() => inputRef.current?.click()} disabled={busy}>
              {file ? 'Выбрать другой файл' : 'Выбрать файл'}
            </button>
            <button className="abtn abtn-ghost" style={dim(downloading)} onClick={() => void onTemplate()} disabled={downloading}>
              Скачать шаблон
            </button>
            <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 0, overflowWrap: 'anywhere' }}>
              {file ? file.name : '.xlsx или .csv, до 500 строк. Одна строка — одно объявление.'}
            </span>
          </div>
        )}

        {previewing && <p style={{ color: 'var(--muted)' }}>Проверяем файл…</p>}
        {err && <p role="alert" style={{ color: TONE_COLOR.error, marginBottom: 12 }}>{err}</p>}

        {report && summary && (
          <>
            <div className="row gap-8" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <Counter label={done ? 'Создано' : 'Будет создано'} value={done ? summary.created : summary.to_create} />
              <Counter label="Уже существует" value={summary.skipped_exists} />
              <Counter label="Повтор в файле" value={summary.skipped_duplicate_in_file} />
              <Counter label="Ошибки" value={summary.errors} />
            </div>
            {report.unknown_columns.length > 0 && (
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10, overflowWrap: 'anywhere' }}>
                Колонки не распознаны и пропущены: {report.unknown_columns.join(', ')}
              </p>
            )}
            <label className="row gap-8" style={{ fontSize: 13, marginBottom: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              Только проблемные строки
            </label>
            <div className="a-card table-scroll" style={{ overflow: 'auto', flex: 1, minHeight: 120 }}>
              <table className="a-table">
                <thead>
                  <tr>
                    <th>Строка</th>
                    <th>Телефон</th>
                    <th>Заголовок</th>
                    <th>Итог</th>
                    <th>Подробности</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.row}>
                      <td>{v.row}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{v.phone}</td>
                      <td>
                        <div title={v.title} style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                      </td>
                      <td style={{ color: TONE_COLOR[v.tone], fontWeight: 700, whiteSpace: 'nowrap' }}>{v.label}</td>
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
                      <td colSpan={5} style={{ color: 'var(--muted)' }}>Проблемных строк нет</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="row gap-8" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="abtn abtn-outline" style={dim(closeLocked)} onClick={onClose} disabled={closeLocked}>
            {done ? 'Закрыть' : 'Отмена'}
          </button>
          {!done && (
            <button
              className="abtn abtn-primary"
              style={dim(busy || !summary || summary.to_create === 0)}
              onClick={() => void onRun()}
              disabled={busy || !summary || summary.to_create === 0}
            >
              {running ? 'Импортируем…' : importButtonLabel(summary?.to_create ?? null)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
