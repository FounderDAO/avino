/**
 * SavedSearches — вкладка «Сохранённые поиски» (мок).
 * Список сохранённых наборов параметров с тумблером email-уведомлений
 * и удалением. Состояние локальное (не сохраняется), переход — на /search.
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Сохранённый поиск (мок). */
interface SavedSearch {
  id: number;
  title: string;
  meta: string;
  count: number;
  alert: boolean;
}

const INITIAL: SavedSearch[] = [
  { id: 1, title: 'Купить · Квартира · Юнусабад', meta: 'до $120 000 · 2–3 комнаты', count: 48, alert: true },
  { id: 2, title: 'Аренда · Чиланзар', meta: 'до 8 млн сум/мес · от 2 комнат', count: 17, alert: true },
  { id: 3, title: 'Новостройки · Tashkent City', meta: 'от застройщика · от 60 м²', count: 9, alert: false },
];

export function SavedSearches() {
  const [items, setItems] = React.useState<SavedSearch[]>(INITIAL);

  const toggle = (id: number) =>
    setItems((p) => p.map((x) => (x.id === id ? { ...x, alert: !x.alert } : x)));
  const remove = (id: number) => setItems((p) => p.filter((x) => x.id !== id));

  return (
    <div>
      <h1 className="mb-[18px] text-[28px]">Сохранённые поиски</h1>
      <div className="flex flex-col gap-3">
        {items.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3.5 rounded-card border border-border/60 bg-surface px-[18px] py-4 shadow-card"
          >
            <Link href="/search" className="min-w-0">
              <div className="text-base font-bold">{s.title}</div>
              <div className="mt-[3px] text-[13.5px] text-muted-foreground">
                {s.meta} · <b className="text-teal">{s.count} объявлений</b>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className={cn(
                  'flex items-center gap-2 text-[13.5px] font-bold',
                  s.alert ? 'text-teal' : 'text-muted-foreground',
                )}
              >
                <Bell size={17} fill={s.alert ? 'currentColor' : 'none'} />
                {s.alert ? 'Уведомления вкл.' : 'Уведомления выкл.'}
              </button>
              <button
                type="button"
                onClick={() => remove(s.id)}
                aria-label="Удалить поиск"
                className="p-1 text-muted-foreground hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
