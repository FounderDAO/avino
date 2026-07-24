/**
 * OriginalTranslationEditor — редактор авторского оригинала в панели «Переводы»
 * (ADR-0156).
 *
 * В отличие от read-only строки «Исходный», позволяет модератору:
 *  - сменить «Язык оригинала» (селект) — типовой кейс «автор написал по-русски,
 *    а пометил EN»: смена EN→RU переносит текст в правильный слот и на бэке
 *    очищает производные переводы;
 *  - отредактировать заголовок и описание оригинала (частая правка опечаток).
 *
 * `address_note`/`features_text` не редактируются в UI, но передаются сквозняком
 * из `item` — бэкенд перезаписывает строку оригинала целиком (ADR-0156), иначе
 * они занулятся. После сохранения модератор жмёт «Сгенерировать переводы».
 *
 * Стили совпадают с остальной admin-страницей и `TranslationRow`.
 */
'use client';

import { useState } from 'react';
import type { TranslationItem, TranslationLanguage, UpdateOriginalRequest } from '@/store/api/adminTypes';

const LANG_LABEL: Record<TranslationLanguage, string> = {
  RU: 'Русский',
  UZ: 'Ўзбекча',
  EN: 'English',
};

const LANGUAGES: TranslationLanguage[] = ['RU', 'UZ', 'EN'];

interface OriginalTranslationEditorProps {
  item: TranslationItem;
  /** Текущий язык оригинала (для селекта и определения «переноса»). */
  originalLanguage: TranslationLanguage;
  onSave: (body: UpdateOriginalRequest) => void;
  saving?: boolean;
}

export function OriginalTranslationEditor({
  item,
  originalLanguage,
  onSave,
  saving,
}: OriginalTranslationEditorProps) {
  const [language, setLanguage] = useState<TranslationLanguage>(originalLanguage);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');

  const languageChanged = language !== originalLanguage;
  const isDirty =
    languageChanged || title !== item.title || description !== (item.description ?? '');

  const submit = () => {
    if (
      languageChanged &&
      !window.confirm(
        `Сменить язык оригинала на «${LANG_LABEL[language]}»? Текущие переводы на другие языки будут удалены — их нужно будет сгенерировать заново.`,
      )
    ) {
      return;
    }
    onSave({
      original_language: language,
      title,
      description: description || null,
      // Сквозняком — бэкенд перезаписывает строку оригинала целиком (ADR-0156).
      address_note: item.address_note,
      features_text: item.features_text,
    });
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
      <div className="row gap-8" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <span
          className="a-pill"
          style={{ background: 'var(--mint)', color: 'var(--teal-deep)', fontWeight: 800, fontSize: 12 }}
        >
          {LANG_LABEL[originalLanguage]}
        </span>
        <span
          className="a-pill"
          style={{ background: 'var(--gold-bg)', color: 'var(--gold)', fontSize: 11 }}
        >
          Исходный
        </span>
      </div>

      <div className="col gap-8">
        <div>
          <label
            className="muted"
            style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}
          >
            Язык оригинала
          </label>
          <select
            className="a-field"
            style={{ width: '100%' }}
            value={language}
            onChange={(e) => setLanguage(e.target.value as TranslationLanguage)}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </select>
          {languageChanged && (
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4, color: 'var(--warn)' }}>
              При смене языка текущие переводы будут удалены — сгенерируйте их заново.
            </div>
          )}
        </div>

        <div>
          <label
            className="muted"
            style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}
          >
            Заголовок
          </label>
          <input
            className="a-field"
            style={{ width: '100%' }}
            value={title}
            maxLength={255}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label
            className="muted"
            style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}
          >
            Описание
          </label>
          <textarea
            className="a-field"
            style={{ width: '100%', minHeight: 72, resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="abtn abtn-outline abtn-sm"
          disabled={saving || !isDirty || !title.trim()}
          onClick={submit}
        >
          {saving ? 'Сохранение…' : 'Сохранить оригинал'}
        </button>
      </div>
    </div>
  );
}
