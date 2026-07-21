/**
 * Менеджер юр-документов (спека 2026-07-21-admin-legal-documents, API.md §23).
 * Вкладки по kind (Правила/Политика), карточка текущей PUBLISHED-версии,
 * таблица истории версий. «Редактировать» открывает существующий DRAFT из
 * списка либо создаёт новый (POST /admin/legal-documents) и сразу переходит
 * в редактор; «Просмотр» открывает не-DRAFT версию в read-only редакторе.
 * Пока открыт LegalDraftEditor — список не рендерится (один экран за раз).
 */
'use client';

import { useState } from 'react';
import { IC } from '@/components/admin/icons';
import { Pill } from '@/components/admin/ui/pill';
import { useToast } from '@/components/admin/toast';
import {
  useGetLegalDocumentsQuery,
  useCreateLegalDraftMutation,
  type LegalDocKindApi,
  type LegalDocStatusApi,
} from '@/store/api/adminLegalDocumentsApi';
import { getApiError } from '@/store/api/apiError';
import { LegalDraftEditor } from './LegalDraftEditor';

const KIND_TABS: [LegalDocKindApi, string][] = [
  ['TERMS', 'Правила'],
  ['PRIVACY', 'Политика'],
];

const STATUS_LABEL: Record<LegalDocStatusApi, [string, string, string]> = {
  DRAFT: ['Черновик', 'var(--warn)', 'var(--warn-bg)'],
  PUBLISHED: ['Опубликован', 'var(--green)', 'var(--green-bg)'],
  ARCHIVED: ['В архиве', 'var(--muted)', 'var(--surface-2)'],
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ru-RU') : '—';
}

export function LegalDocumentsManager() {
  const showToast = useToast();
  const [kind, setKind] = useState<LegalDocKindApi>('TERMS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useGetLegalDocumentsQuery({ kind });
  const [createDraft, { isLoading: creating }] = useCreateLegalDraftMutation();

  if (editingId) {
    return <LegalDraftEditor id={editingId} onClose={() => setEditingId(null)} />;
  }

  const rows = data ?? [];
  const published = rows.find((d) => d.status === 'PUBLISHED') ?? null;
  const draft = rows.find((d) => d.status === 'DRAFT') ?? null;
  const history = [...rows].sort((a, b) => b.version - a.version);

  async function onEditClick() {
    if (draft) {
      setEditingId(draft.id);
      return;
    }
    try {
      const created = await createDraft({ kind }).unwrap();
      setEditingId(created.id);
    } catch (e) {
      showToast(getApiError(e as never)?.message ?? 'Не удалось создать черновик');
    }
  }

  return (
    <div>
      {/* ── Вкладки типа документа ─────────────────────────────────────────── */}
      <div className="row" style={{ gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {KIND_TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 14px',
              marginBottom: -1,
              fontSize: 14.5,
              fontWeight: 700,
              color: kind === k ? 'var(--ink)' : 'var(--muted)',
              borderBottom: kind === k ? '2.5px solid var(--red)' : '2.5px solid transparent',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить документы.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : isLoading ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted">Загрузка…</p>
        </div>
      ) : (
        <>
          {/* ── Текущая опубликованная версия ──────────────────────────────── */}
          <div className="a-card" style={{ padding: 20, marginBottom: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                {published ? (
                  <>
                    <div className="row gap-8" style={{ alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 16 }}>Версия {published.version}</span>
                      <Pill bg={STATUS_LABEL.PUBLISHED[2]} color={STATUS_LABEL.PUBLISHED[1]}>
                        {STATUS_LABEL.PUBLISHED[0]}
                      </Pill>
                    </div>
                    <p className="muted" style={{ fontSize: 13.5 }}>
                      Опубликовано {fmtDate(published.published_at)}
                    </p>
                  </>
                ) : (
                  <p className="muted">Опубликованной версии ещё нет — на клиенте показывается вшитый фолбэк.</p>
                )}
              </div>
              <button
                className="abtn abtn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: creating ? 0.6 : 1 }}
                disabled={creating}
                onClick={onEditClick}
              >
                <IC.Edit size={16} /> {creating ? '…' : draft ? 'Редактировать черновик' : 'Создать черновик'}
              </button>
            </div>
          </div>

          {/* ── История версий ─────────────────────────────────────────────── */}
          <div className="a-card table-scroll">
            <table className="a-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Версия</th>
                  <th style={{ width: 150 }}>Статус</th>
                  <th>Опубликована</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                      Версий пока нет.
                    </td>
                  </tr>
                ) : (
                  history.map((d) => {
                    const [label, color, bg] = STATUS_LABEL[d.status];
                    return (
                      <tr key={d.id}>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{d.version}</td>
                        <td><Pill bg={bg} color={color}>{label}</Pill></td>
                        <td className="muted">{fmtDate(d.published_at)}</td>
                        <td>
                          <button className="abtn abtn-outline" onClick={() => setEditingId(d.id)}>
                            {d.status === 'DRAFT' ? 'Редактировать' : 'Просмотр'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
