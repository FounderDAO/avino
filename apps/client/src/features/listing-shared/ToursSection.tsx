'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { TourWindow } from '@/lib/mock/types';

export interface ToursSectionValue {
  enabled: boolean;
  windows: TourWindow[];
}
export interface ToursSectionProps extends ToursSectionValue {
  onChange: (next: ToursSectionValue) => void;
}

const MAX_WINDOWS = 6;
const DEFAULT_WINDOW: TourWindow = { start: '09:00', end: '12:00' };

export function ToursSection({ enabled, windows, onChange }: ToursSectionProps) {
  const t = useTranslations('listingEdit');

  const toggle = (next: boolean) => {
    // Включение без окон → сразу добавляем дефолтное (бэкенд требует ≥1).
    const w = next && windows.length === 0 ? [DEFAULT_WINDOW] : windows;
    onChange({ enabled: next, windows: w });
  };
  const addWindow = () => {
    if (windows.length >= MAX_WINDOWS) return;
    onChange({ enabled, windows: [...windows, DEFAULT_WINDOW] });
  };
  const removeWindow = (i: number) => {
    onChange({ enabled, windows: windows.filter((_, idx) => idx !== i) });
  };
  const setField = (i: number, key: keyof TourWindow, value: string) => {
    onChange({ enabled, windows: windows.map((w, idx) => (idx === i ? { ...w, [key]: value } : w)) });
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-base font-bold">
        <input type="checkbox" aria-label={t('tours.enable')} checked={enabled} onChange={(e) => toggle(e.target.checked)} />
        {t('tours.enable')}
      </label>
      {enabled && (
        <>
          <p className="text-[13px] text-muted-foreground">{t('tours.hint')}</p>
          {windows.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[13px]">{t('tours.from')}</span>
              <input type="time" value={w.start} onChange={(e) => setField(i, 'start', e.target.value)}
                className="rounded-lg border border-border bg-bg px-2 py-1.5" />
              <span className="text-[13px]">{t('tours.to')}</span>
              <input type="time" value={w.end} onChange={(e) => setField(i, 'end', e.target.value)}
                className="rounded-lg border border-border bg-bg px-2 py-1.5" />
              <button type="button" onClick={() => removeWindow(i)} className="text-[13px] text-red">{t('tours.remove')}</button>
            </div>
          ))}
          {windows.length < MAX_WINDOWS && (
            <Button type="button" variant="outline" size="sm" onClick={addWindow}>{t('tours.addWindow')}</Button>
          )}
          {windows.length === 0 && <div className="text-[12.5px] text-red">{t('tours.needWindow')}</div>}
        </>
      )}
    </div>
  );
}
