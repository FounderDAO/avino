/**
 * Notifications — вкладка «Уведомления» (мок-лента).
 * Клик по карточке помечает прочитанным, «Прочитать все» — массово.
 * Непрочитанные подсвечены красной левой полосой и точкой.
 */
'use client';

import * as React from 'react';
import { Home, Bell, MessageCircle, Sparkles, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Уведомление (мок). */
interface Notification {
  id: number;
  icon: LucideIcon;
  title: string;
  text: string;
  time: string;
  read: boolean;
}

const INITIAL: Notification[] = [
  { id: 1, icon: Home, title: 'Объявление одобрено', text: '«Просторная 3-комнатная у метро» прошло модерацию и опубликовано.', time: '2 ч назад', read: false },
  { id: 2, icon: Bell, title: 'Новое по вашему поиску', text: '5 новых объявлений по запросу «Купить · Квартира · Юнусабад».', time: '5 ч назад', read: false },
  { id: 3, icon: MessageCircle, title: 'Новое сообщение', text: 'Дилноза Каримова ответила в чате по объявлению.', time: 'Вчера', read: true },
  { id: 4, icon: Sparkles, title: 'Скидка на продвижение', text: 'VIP-размещение со скидкой 20% до конца недели.', time: '2 дня назад', read: true },
];

export function Notifications() {
  const [items, setItems] = React.useState<Notification[]>(INITIAL);

  const markRead = (id: number) =>
    setItems((p) => p.map((x) => (x.id === id ? { ...x, read: true } : x)));
  const readAll = () => setItems((p) => p.map((x) => ({ ...x, read: true })));

  return (
    <div>
      <div className="mb-[18px] flex items-center justify-between">
        <h1 className="text-[28px]">Уведомления</h1>
        <Button variant="ghost" size="sm" onClick={readAll}>
          Прочитать все
        </Button>
      </div>

      <div className="flex flex-col gap-2.5">
        {items.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.id}
              onClick={() => markRead(n.id)}
              className={cn(
                'flex cursor-pointer items-start gap-3.5 rounded-card bg-surface px-4 py-3.5 shadow-card',
                n.read ? 'border border-border/60' : 'border-l-[3px] border-red',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-teal">
                <Icon size={20} strokeWidth={1.9} />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2.5">
                  <b className="text-[15px]">{n.title}</b>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{n.time}</span>
                </div>
                <p className="mt-[3px] text-sm text-muted-foreground">{n.text}</p>
              </div>
              {!n.read && (
                <span className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-red" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
