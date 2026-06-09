/**
 * Inbox — вкладка «Сообщения» (мок-чат).
 * Слева список диалогов, справа окно переписки. Сообщения статичные;
 * отправка добавляет реплику в локальное состояние (не сохраняется).
 */
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/field';

/** Реплика: [автор, текст]. */
type Msg = ['me' | 'them', string];

/** Диалог (мок). */
interface Thread {
  id: number;
  name: string;
  pro: boolean;
  listing: string;
  last: string;
  time: string;
  unread: number;
  msgs: Msg[];
}

const THREADS: Thread[] = [
  {
    id: 1,
    name: 'Дилноза Каримова',
    pro: true,
    listing: 'Просторная 3-комнатная у метро',
    last: 'Да, можно посмотреть завтра в 15:00',
    time: '12:40',
    unread: 2,
    msgs: [
      ['them', 'Здравствуйте! Квартира ещё актуальна?'],
      ['me', 'Здравствуйте! Да, актуальна.'],
      ['them', 'Можно посмотреть завтра?'],
      ['me', 'Конечно, в какое время удобно?'],
      ['them', 'Да, можно посмотреть завтра в 15:00'],
    ],
  },
  {
    id: 2,
    name: 'Boulevard Development',
    pro: true,
    listing: '2-комнатная в новостройке',
    last: 'Отправили вам планировки на почту',
    time: 'Вчера',
    unread: 0,
    msgs: [
      ['them', 'Здравствуйте! Спасибо за интерес к ЖК Boulevard.'],
      ['me', 'Какие есть варианты рассрочки?'],
      ['them', 'Отправили вам планировки на почту'],
    ],
  },
  {
    id: 3,
    name: 'Рустам Ахмедов',
    pro: false,
    listing: 'Двухэтажный дом с участком',
    last: 'Торг уместен при быстрой сделке',
    time: 'Пн',
    unread: 0,
    msgs: [
      ['me', 'Добрый день! Возможен ли торг?'],
      ['them', 'Торг уместен при быстрой сделке'],
    ],
  },
];

export function Inbox() {
  const [sel, setSel] = React.useState<Thread>(THREADS[0]);
  const [text, setText] = React.useState('');
  const [msgs, setMsgs] = React.useState<Msg[]>(THREADS[0].msgs);

  const openThread = (t: Thread) => {
    setSel(t);
    setMsgs(t.msgs);
  };
  const send = () => {
    if (!text.trim()) return;
    setMsgs((m) => [...m, ['me', text.trim()]]);
    setText('');
  };

  return (
    <div>
      <h1 className="mb-[18px] text-[28px]">Сообщения</h1>
      <div className="grid h-[540px] grid-cols-1 overflow-hidden rounded-card border border-border/60 bg-surface shadow-card sm:grid-cols-[300px_1fr]">
        {/* Список диалогов */}
        <div className="hidden overflow-y-auto border-r border-border sm:block">
          {THREADS.map((t) => (
            <button
              key={t.id}
              onClick={() => openThread(t)}
              className={cn(
                'flex w-full gap-3 border-b border-border px-4 py-3.5 text-left',
                sel.id === t.id ? 'bg-surface-2' : 'bg-transparent hover:bg-surface-2',
              )}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint font-extrabold text-teal-deep">
                {t.name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between">
                  <b className="truncate text-[14.5px]">{t.name}</b>
                  <span className="text-xs text-muted-foreground">{t.time}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                  {t.last}
                </span>
              </span>
              {t.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center self-center rounded-pill bg-red px-1.5 text-[11.5px] font-extrabold text-white">
                  {t.unread}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Окно переписки */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-3 border-b border-border px-[18px] py-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mint font-extrabold text-teal-deep">
              {sel.name[0]}
            </span>
            <div>
              <div className="font-bold">
                {sel.name}
                {sel.pro && (
                  <span className="ml-1 rounded-[5px] bg-mint px-1.5 py-px text-[10.5px] font-extrabold text-teal-deep">
                    Pro
                  </span>
                )}
              </div>
              <div className="text-[12.5px] text-muted-foreground">{sel.listing}</div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-surface-2 p-[18px]">
            {msgs.map(([who, m], i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[72%] rounded-[14px] px-3.5 py-2.5 text-[14.5px]',
                  who === 'me'
                    ? 'self-end rounded-br-[4px] bg-red text-white'
                    : 'self-start rounded-bl-[4px] border border-border bg-surface text-ink',
                )}
              >
                {m}
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t border-border p-3.5">
            <input
              className={cn(fieldClass, 'rounded-pill')}
              placeholder="Напишите сообщение…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <Button type="button" onClick={send} className="shrink-0">
              Отправить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
