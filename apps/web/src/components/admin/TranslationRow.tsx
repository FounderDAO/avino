/**
 * TranslationRow — строка перевода в панели «Переводы» карточки модерации.
 *
 * Показывает один языковой вариант объявления: заголовок + описание.
 * Исходный язык (original=true) — только для чтения.
 * Ручные правки маркируются бейджем «Правлено вручную».
 * «Сохранить» недоступен пока идёт сохранение (saving=true).
 *
 * Стили совпадают с остальной admin-страницей: .a-field, .abtn, .a-pill, .muted.
 */
'use client';

import { useState } from 'react';
import type { TranslationItem, TranslationEditRequest } from '@/store/api/adminTypes';

const LANG_LABEL: Record<string, string> = {
  RU: 'Русский',
  UZ: 'Ўзбекча',
  EN: 'English',
};

interface TranslationRowProps {
  item: TranslationItem;
  original: boolean;
  onSave: (body: TranslationEditRequest) => void;
  saving?: boolean;
}

export function TranslationRow({ item, original, onSave, saving }: TranslationRowProps) {
  const [description, setDescription] = useState(item.description ?? '');

  const isDirty = description !== (item.description ?? '');

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        paddingTop: 14,
        marginTop: 14,
      }}
    >
      <div className="row gap-8" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <span
          className="a-pill"
          style={{
            background: original ? 'var(--mint)' : 'var(--archive-bg)',
            color: original ? 'var(--teal-deep)' : 'var(--ink)',
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {LANG_LABEL[item.language] ?? item.language}
        </span>
        {original && (
          <span
            className="a-pill"
            style={{ background: 'var(--gold-bg)', color: 'var(--gold)', fontSize: 11 }}
          >
            Исходный
          </span>
        )}
        {!item.is_auto_translated && (
          <span
            className="a-pill"
            style={{ background: 'var(--warn-bg)', color: 'var(--warn)', fontSize: 11 }}
          >
            Правлено вручную
          </span>
        )}
      </div>

      <div className="col gap-8">
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
            readOnly={original}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {!original && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="abtn abtn-outline abtn-sm"
            disabled={saving || !isDirty}
            onClick={() =>
              onSave({
                title: item.title,
                description: description || null,
              })
            }
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      )}
    </div>
  );
}
