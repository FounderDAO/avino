/**
 * Панель лимита активных объявлений обычного клиента (ADMIN).
 * Client-island: показывает текущий лимит + ручная установка без пересборки.
 * «Занятым слотом» на бэкенде считаются ACTIVE + на модерации (NEW); агенты и
 * агентства под лимит не попадают; `0` = без лимита. Зеркалит ExchangeRatePanel.
 */
'use client';

import { useState } from 'react';
import {
  useGetActiveListingLimitQuery,
  useUpdateActiveListingLimitMutation,
} from '@/store/api/adminActiveListingLimitApi';

export function ActiveListingLimitControl() {
  const { data, isLoading } = useGetActiveListingLimitQuery();
  const [update, { isLoading: isSaving }] = useUpdateActiveListingLimitMutation();
  const [draft, setDraft] = useState('');

  const current = data?.activeListingLimit;
  // Валидный ввод — целое ≥ 0.
  const parsed = Number(draft.trim());
  const valid = draft.trim() !== '' && Number.isInteger(parsed) && parsed >= 0;

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5 }}>
        Лимит активных объявлений
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
        Сколько объявлений может держать обычный клиент (считаются активные и на
        модерации). Агенты и агентства — без лимита. «0» — снять ограничение. Без
        пересборки.
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
        Текущий лимит:{' '}
        <strong style={{ color: 'var(--ink, inherit)' }}>
          {isLoading ? '…' : current === 0 ? 'без лимита' : current}
        </strong>
      </div>

      <div className="row gap-16" style={{ marginTop: 12, alignItems: 'center' }}>
        <input
          className="a-field"
          inputMode="numeric"
          placeholder="Напр. 2"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="abtn abtn-primary"
          disabled={isSaving || !valid}
          onClick={async () => {
            await update({ limit: parsed });
            setDraft('');
          }}
        >
          {isSaving ? '…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
