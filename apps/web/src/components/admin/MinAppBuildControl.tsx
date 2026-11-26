/**
 * Панель минимальной сборки мобильного приложения (ADMIN) — «обязательное
 * обновление». Client-island: показывает текущие значения iOS/Android + ручная
 * установка без пересборки. Приложение со сборкой ниже значения покажет экран
 * обязательного обновления; `0` = не требовать. Зеркалит
 * ActiveListingLimitControl.
 */
'use client';

import { useState } from 'react';
import {
  useGetMinAppBuildQuery,
  useUpdateMinAppBuildMutation,
} from '@/store/api/adminMinAppBuildApi';

const MAX_BUILD = 1_000_000;

/** Пустая строка → не менять; иначе целое 0..MAX_BUILD или null (невалидно). */
function parseBuild(draft: string): number | undefined | null {
  const t = draft.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= MAX_BUILD ? n : null;
}

function formatBuild(value: number | undefined, loading: boolean) {
  if (loading || value === undefined) return '…';
  return value === 0 ? 'не требуется' : value;
}

export function MinAppBuildControl() {
  const { data, isLoading } = useGetMinAppBuildQuery();
  const [update, { isLoading: isSaving }] = useUpdateMinAppBuildMutation();
  const [iosDraft, setIosDraft] = useState('');
  const [androidDraft, setAndroidDraft] = useState('');

  const ios = parseBuild(iosDraft);
  const android = parseBuild(androidDraft);
  // Валидно, если хотя бы одно поле заполнено и ни одно не испорчено.
  const valid =
    ios !== null &&
    android !== null &&
    (ios !== undefined || android !== undefined);

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5 }}>
        Минимальная сборка приложения
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
        Приложения со сборкой ниже этого номера покажут экран обязательного
        обновления. 0 — не требовать.
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
        Сейчас: iOS{' '}
        <strong style={{ color: 'var(--ink, inherit)' }}>
          {formatBuild(data?.ios, isLoading)}
        </strong>
        , Android{' '}
        <strong style={{ color: 'var(--ink, inherit)' }}>
          {formatBuild(data?.android, isLoading)}
        </strong>
      </div>

      <div className="row gap-16" style={{ marginTop: 12, alignItems: 'center' }}>
        <input
          className="a-field"
          inputMode="numeric"
          aria-label="Минимальная сборка iOS"
          placeholder="iOS, напр. 10"
          value={iosDraft}
          onChange={(e) => setIosDraft(e.target.value)}
        />
        <input
          className="a-field"
          inputMode="numeric"
          aria-label="Минимальная сборка Android"
          placeholder="Android, напр. 10"
          value={androidDraft}
          onChange={(e) => setAndroidDraft(e.target.value)}
        />
        <button
          type="button"
          className="abtn abtn-primary"
          disabled={isSaving || !valid}
          onClick={async () => {
            const body: { ios?: number; android?: number } = {};
            if (typeof ios === 'number') body.ios = ios;
            if (typeof android === 'number') body.android = android;
            await update(body);
            setIosDraft('');
            setAndroidDraft('');
          }}
        >
          {isSaving ? '…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
