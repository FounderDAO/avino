/**
 * Редактор версии юр-документа (спека 2026-07-21-admin-legal-documents,
 * API.md §23). Полный документ — плоские title_ru/uz/en + body_md_ru/uz/en.
 * Локальный стейт 6 полей инициализируется один раз по приходу данных
 * (иначе рефетч после сохранения затёр бы несохранённый ввод). readOnly —
 * для версий, которые уже не DRAFT (PUBLISHED/ARCHIVED — просмотр истории).
 *
 * Предпросмотр рендерит `parseLegalMarkdown` активной локали (@avino/shared,
 * то же markdown-подмножество, что рендерит apps/client), плашка
 * `legalAnchorWarnings` предупреждает о позиционных/расходящихся якорях.
 */
'use client';

import { useEffect, useState } from 'react';
import { parseLegalMarkdown, legalAnchorWarnings } from '@avino/shared';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import {
  useGetLegalDocumentQuery,
  useUpdateLegalDraftMutation,
  useDeleteLegalDraftMutation,
  usePublishLegalDocumentMutation,
} from '@/store/api/adminLegalDocumentsApi';
import { getApiError } from '@/store/api/apiError';

const LOCALES = ['ru', 'uz', 'en'] as const;
type Locale = (typeof LOCALES)[number];
const LOCALE_LABEL: Record<Locale, string> = { ru: 'RU', uz: 'UZ', en: 'EN' };

const KIND_LABEL: Record<string, string> = { TERMS: 'Правила использования', PRIVACY: 'Политика конфиденциальности' };
const STATUS_LABEL: Record<string, string> = { DRAFT: 'Черновик', PUBLISHED: 'Опубликован', ARCHIVED: 'В архиве' };

const labelStyle = { fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 } as const;

interface LegalDraftEditorProps {
  id: string;
  onClose: () => void;
}

export function LegalDraftEditor({ id, onClose }: LegalDraftEditorProps) {
  const showToast = useToast();
  const { data: doc, isLoading, isError, refetch } = useGetLegalDocumentQuery(id);
  const [updateDraft, { isLoading: saving }] = useUpdateLegalDraftMutation();
  const [deleteDraft, { isLoading: deleting }] = useDeleteLegalDraftMutation();
  const [publish, { isLoading: publishing }] = usePublishLegalDocumentMutation();

  const [initialized, setInitialized] = useState(false);
  const [locale, setLocale] = useState<Locale>('ru');
  const [titleRu, setTitleRu] = useState('');
  const [titleUz, setTitleUz] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [bodyRu, setBodyRu] = useState('');
  const [bodyUz, setBodyUz] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [requiresConsent, setRequiresConsent] = useState(false);
  const [publishErr, setPublishErr] = useState<string | null>(null);

  useEffect(() => {
    if (doc && !initialized) {
      setTitleRu(doc.title_ru);
      setTitleUz(doc.title_uz);
      setTitleEn(doc.title_en);
      setBodyRu(doc.body_md_ru);
      setBodyUz(doc.body_md_uz);
      setBodyEn(doc.body_md_en);
      setInitialized(true);
    }
  }, [doc, initialized]);

  if (isLoading || !initialized) {
    return (
      <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
        <p className="muted">Загрузка…</p>
      </div>
    );
  }
  if (isError || !doc) {
    return (
      <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
        <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить документ.</p>
        <div className="row gap-10" style={{ justifyContent: 'center' }}>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
          <button className="abtn abtn-outline" onClick={onClose}>Назад</button>
        </div>
      </div>
    );
  }

  const readOnly = doc.status !== 'DRAFT';
  const byLocale: Record<Locale, { title: string; setTitle: (v: string) => void; body: string; setBody: (v: string) => void }> = {
    ru: { title: titleRu, setTitle: setTitleRu, body: bodyRu, setBody: setBodyRu },
    uz: { title: titleUz, setTitle: setTitleUz, body: bodyUz, setBody: setBodyUz },
    en: { title: titleEn, setTitle: setTitleEn, body: bodyEn, setBody: setBodyEn },
  };
  const current = byLocale[locale];
  const parsed = parseLegalMarkdown(current.body);
  const warnings = legalAnchorWarnings({ ru: bodyRu, uz: bodyUz, en: bodyEn });

  async function onSave() {
    try {
      await updateDraft({
        id,
        body: {
          title_ru: titleRu, title_uz: titleUz, title_en: titleEn,
          body_md_ru: bodyRu, body_md_uz: bodyUz, body_md_en: bodyEn,
        },
      }).unwrap();
      showToast('Черновик сохранён');
    } catch (e) {
      showToast(getApiError(e as never)?.message ?? 'Не удалось сохранить черновик');
    }
  }

  async function onDelete() {
    if (!window.confirm('Удалить черновик безвозвратно?')) return;
    try {
      await deleteDraft(id).unwrap();
      showToast('Черновик удалён');
      onClose();
    } catch (e) {
      showToast(getApiError(e as never)?.message ?? 'Не удалось удалить черновик');
    }
  }

  async function onPublish() {
    setPublishErr(null);
    try {
      await publish({ id, requires_consent: requiresConsent }).unwrap();
      showToast('Документ опубликован');
      setPublishOpen(false);
      onClose();
    } catch (e) {
      setPublishErr(getApiError(e as never)?.message ?? 'Не удалось опубликовать документ');
    }
  }

  return (
    <div>
      {/* ── Заголовок ───────────────────────────────────────────────────────── */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button className="abtn abtn-outline" style={{ marginBottom: 10 }} onClick={onClose}>
            ← К списку версий
          </button>
          <h2 style={{ fontSize: 20 }}>
            {KIND_LABEL[doc.kind] ?? doc.kind} — версия {doc.version} · {STATUS_LABEL[doc.status] ?? doc.status}
          </h2>
        </div>
        {!readOnly && (
          <div className="row gap-10">
            <button className="abtn abtn-outline" style={{ opacity: deleting ? 0.6 : 1 }} disabled={deleting} onClick={onDelete}>
              Удалить черновик
            </button>
            <button className="abtn abtn-outline" style={{ opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={onSave}>
              {saving ? '…' : 'Сохранить черновик'}
            </button>
            <button
              className="abtn abtn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => { setPublishErr(null); setRequiresConsent(false); setPublishOpen(true); }}
            >
              Опубликовать…
            </button>
          </div>
        )}
      </div>

      {/* ── Вкладки локали ──────────────────────────────────────────────────── */}
      <div className="row" style={{ gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 14px',
              marginBottom: -1,
              fontSize: 14.5,
              fontWeight: 700,
              color: locale === l ? 'var(--ink)' : 'var(--muted)',
              borderBottom: locale === l ? '2.5px solid var(--red)' : '2.5px solid transparent',
              cursor: 'pointer',
            }}
          >
            {LOCALE_LABEL[l]}
          </button>
        ))}
      </div>

      <div className="row gap-16" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── Редактор ──────────────────────────────────────────────────────── */}
        <div style={{ flex: '1 1 420px', minWidth: 320 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Заголовок ({LOCALE_LABEL[locale]})</label>
            <input
              className="a-field"
              style={{ width: '100%' }}
              value={current.title}
              onChange={(e) => current.setTitle(e.target.value)}
              readOnly={readOnly}
            />
          </div>
          <div>
            <label style={labelStyle}>Текст markdown ({LOCALE_LABEL[locale]})</label>
            <textarea
              className="a-field"
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
              rows={24}
              value={current.body}
              onChange={(e) => current.setBody(e.target.value)}
              readOnly={readOnly}
            />
          </div>
        </div>

        {/* ── Предпросмотр + предупреждения ────────────────────────────────── */}
        <div style={{ flex: '1 1 380px', minWidth: 320 }}>
          {warnings.length > 0 && (
            <div style={{ background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
              <strong>Предупреждения:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          <label style={labelStyle}>Предпросмотр ({LOCALE_LABEL[locale]})</label>
          <div className="a-card" style={{ padding: '18px 22px', maxHeight: 640, overflowY: 'auto' }}>
            {parsed.intro && <p style={{ marginBottom: 14 }}>{parsed.intro}</p>}
            {parsed.sections.length === 0 && !parsed.intro && (
              <p className="muted">Текст пуст.</p>
            )}
            {parsed.sections.map((s) => (
              <div key={s.id} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 16 }}>
                  {s.heading} <code style={{ fontSize: 12, color: 'var(--muted)' }}>#{s.id}</code>
                </h3>
                {s.blocks.map((b, i) => {
                  if (b.type === 'p') return <p key={i} style={{ marginTop: 8 }}>{b.text}</p>;
                  if (b.type === 'subheading') return <h4 key={i} style={{ marginTop: 12 }}>{b.text}</h4>;
                  return (
                    <ul key={i} style={{ marginTop: 8, paddingLeft: 20 }}>
                      {b.items.map((it, j) => <li key={j}>{it}</li>)}
                    </ul>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Диалог публикации ──────────────────────────────────────────────── */}
      {publishOpen && (
        <div
          onClick={() => !publishing && setPublishOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(26,26,26,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fade-up a-card"
            style={{ width: '100%', maxWidth: 460, padding: 26, borderRadius: 16 }}
          >
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 20 }}>Опубликовать версию {doc.version}</h2>
              <button className="aicon-btn" style={{ width: 32, height: 32, border: 'none' }} onClick={() => setPublishOpen(false)} disabled={publishing}>
                <IC.X size={18} />
              </button>
            </div>

            <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>
              Текущая опубликованная версия (если есть) будет перенесена в архив.
            </p>

            <label className="row gap-8" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={requiresConsent}
                onChange={(e) => setRequiresConsent(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13.5 }}>
                <strong>Требовать повторное согласие пользователей</strong>
                <br />
                <span className="muted">все пользователи увидят блокирующую модалку согласия</span>
              </span>
            </label>

            {publishErr && (
              <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600, marginTop: 14 }}>{publishErr}</div>
            )}

            <div className="row gap-10" style={{ marginTop: 18 }}>
              <button
                className="abtn abtn-primary"
                style={{ flex: 1, opacity: publishing ? 0.6 : 1 }}
                disabled={publishing}
                onClick={onPublish}
              >
                {publishing ? '…' : 'Опубликовать'}
              </button>
              <button className="abtn abtn-outline" onClick={() => setPublishOpen(false)} disabled={publishing}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
