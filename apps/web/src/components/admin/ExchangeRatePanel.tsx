/**
 * Панель курса валют USD → UZS (ADMIN).
 * Client-island: показывает текущий курс + историю + ручная установка + обновление из ЦБ.
 */
'use client';

import { useState } from 'react';
import {
  useGetAdminExchangeRateQuery,
  useSetExchangeRateMutation,
  useRefreshExchangeRateMutation,
} from '@/store/api/adminExchangeRateApi';

export function ExchangeRatePanel() {
  const { data, isLoading } = useGetAdminExchangeRateQuery();
  const [setRate, { isLoading: isSaving }] = useSetExchangeRateMutation();
  const [refresh, { isLoading: isRefreshing }] = useRefreshExchangeRateMutation();
  const [draft, setDraft] = useState('');

  const current = data?.current;

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5 }}>Курс USD → сум</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
        {isLoading
          ? '…'
          : current
            ? `1 USD = ${current.rate} сум · ${current.source} · ${new Date(current.fetched_at).toLocaleString('ru-RU')}`
            : 'Курс ещё не загружен'}
      </div>

      <div className="row gap-16" style={{ marginTop: 12, alignItems: 'center' }}>
        <input
          className="a-field"
          inputMode="decimal"
          placeholder="Напр. 12700"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="abtn abtn-primary"
          disabled={isSaving || !draft.trim()}
          onClick={async () => {
            await setRate({ rate: draft.trim() });
            setDraft('');
          }}
        >
          {isSaving ? '…' : 'Задать вручную'}
        </button>
        <button
          type="button"
          className="abtn"
          disabled={isRefreshing}
          onClick={() => void refresh()}
        >
          {isRefreshing ? '…' : 'Обновить из ЦБ'}
        </button>
      </div>

      {data?.history?.length ? (
        <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)' }}>
          {data.history.slice(0, 7).map((r, i) => (
            <div key={i}>
              {new Date(r.fetched_at).toLocaleDateString('ru-RU')} — {r.rate} ({r.source})
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
