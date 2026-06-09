/**
 * Settings — вкладка «Настройки» (мок).
 * Язык и валюта чипами + тумблеры уведомлений. Состояние локальное, не сохраняется.
 */
'use client';

import * as React from 'react';
import { Pill } from '@/components/ui/pill';
import { cn } from '@/lib/utils';

/** Простой тумблер (мок). */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-pill transition-colors',
        on ? 'bg-teal' : 'bg-segment-track',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-[left]',
          on ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

/** Описание одной строки-настройки уведомлений. */
interface NotifSetting {
  key: string;
  title: string;
  text: string;
}

const NOTIF_SETTINGS: NotifSetting[] = [
  { key: 'searches', title: 'Новое по сохранённым поискам', text: 'Письмо, когда появляются подходящие объявления.' },
  { key: 'messages', title: 'Сообщения в чате', text: 'Уведомлять о новых сообщениях от авторов объявлений.' },
  { key: 'moderation', title: 'Статус модерации', text: 'Когда объявление одобрено или отклонено.' },
  { key: 'promo', title: 'Акции и продвижение', text: 'Скидки на TOP/VIP и новости Avino.' },
];

export function Settings() {
  const [lang, setLang] = React.useState<'ru' | 'uz' | 'en'>('ru');
  const [currency, setCurrency] = React.useState<'UZS' | 'USD'>('USD');
  const [notifs, setNotifs] = React.useState<Record<string, boolean>>({
    searches: true,
    messages: true,
    moderation: true,
    promo: false,
  });
  const toggle = (k: string) => setNotifs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-[18px] text-[28px]">Настройки</h1>

      <div className="flex flex-col gap-4">
        {/* Язык и валюта */}
        <div className="rounded-card border border-border/60 bg-surface p-6 shadow-card">
          <h2 className="mb-4 text-lg">Язык и валюта</h2>

          <div className="mb-5">
            <div className="mb-[9px] text-[13px] font-bold">Язык интерфейса</div>
            <div className="flex gap-2">
              {(
                [
                  ['ru', 'Русский'],
                  ['uz', 'O‘zbekcha'],
                  ['en', 'English'],
                ] as const
              ).map(([k, v]) => (
                <Pill key={k} active={lang === k} onClick={() => setLang(k)}>
                  {v}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-[9px] text-[13px] font-bold">Валюта цен</div>
            <div className="flex gap-2">
              {(
                [
                  ['USD', 'Доллар $'],
                  ['UZS', 'Сум'],
                ] as const
              ).map(([k, v]) => (
                <Pill key={k} active={currency === k} onClick={() => setCurrency(k)}>
                  {v}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        {/* Уведомления */}
        <div className="rounded-card border border-border/60 bg-surface p-6 shadow-card">
          <h2 className="mb-4 text-lg">Уведомления</h2>
          <div className="flex flex-col divide-y divide-border">
            {NOTIF_SETTINGS.map((n) => (
              <div key={n.key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold">{n.title}</div>
                  <div className="mt-0.5 text-[13.5px] text-muted-foreground">{n.text}</div>
                </div>
                <Toggle on={!!notifs[n.key]} onClick={() => toggle(n.key)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
