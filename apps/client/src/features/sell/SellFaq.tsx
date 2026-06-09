/**
 * SellFaq — аккордеон частых вопросов лендинга (порт Faq из sell.jsx).
 * Локальный стейт открытого пункта; первый раскрыт по умолчанию.
 */
'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const ITEMS: [string, string][] = [
  [
    'Сколько стоит разместить объявление?',
    'Базовое размещение на Avino — бесплатно. Платными являются только услуги продвижения TOP и VIP, которые поднимают объявление выше в выдаче.',
  ],
  [
    'Как быстро объявление появится на сайте?',
    'После заполнения формы объявление уходит на модерацию. Обычно проверка занимает несколько часов; после одобрения оно становится активным и появляется в поиске.',
  ],
  [
    'Нужно ли работать с агентом?',
    'Нет. Вы можете продавать самостоятельно и общаться с покупателями напрямую через чат Avino. Либо доверить показы и переговоры агенту Avino Pro.',
  ],
  [
    'На каких языках публикуется объявление?',
    'Вы заполняете объявление на одном языке, а Avino автоматически переводит его на узбекский, русский и английский.',
  ],
];

export function SellFaq() {
  const [open, setOpen] = useState(0);

  return (
    <div className="flex flex-col gap-3.5">
      {ITEMS.map(([q, a], i) => {
        const active = open === i;
        return (
          <div
            key={q}
            className="cursor-pointer rounded-card bg-surface px-5 shadow-card"
            onClick={() => setOpen(active ? -1 : i)}
          >
            <div className="flex items-center justify-between gap-4 py-4">
              <span className="text-[16.5px] font-bold">{q}</span>
              <ChevronDown
                size={20}
                className={
                  'shrink-0 text-teal transition-transform duration-200 ' +
                  (active ? 'rotate-180' : '')
                }
              />
            </div>
            {active && (
              <p className="m-0 pb-[18px] text-[15px] leading-[1.6] text-muted-foreground">{a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
